import type { ElectronicComponent, Viewport, Wire } from '../../model/types';
import { localToWorld, worldToScreen } from '../../model/coordinates';
import { visualBounds } from '../../model/physical';
import { wirePoints } from '../../model/editor';

export interface PanelRect { x: number; y: number; width: number; height: number }
export interface PanelObstacle { rect: PanelRect; weight: number }
export interface InspectorAnchor { rect: PanelRect; obstacles: PanelObstacle[]; protect: boolean }
const right = (rect: PanelRect) => rect.x + rect.width;
const bottom = (rect: PanelRect) => rect.y + rect.height;
export function overlapArea(a: PanelRect, b: PanelRect): number {
  return Math.max(0, Math.min(right(a), right(b)) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(bottom(a), bottom(b)) - Math.max(a.y, b.y));
}
function enclosing(points: readonly { x: number; y: number }[]): PanelRect {
  const xs = points.map((point) => point.x), ys = points.map((point) => point.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, width: Math.max(1, Math.max(...xs) - x), height: Math.max(1, Math.max(...ys) - y) };
}
export function componentScreenBounds(component: ElectronicComponent, viewport: Viewport): PanelRect {
  const bounds = visualBounds(component.kind);
  return enclosing([
    { x: bounds.x, y: bounds.y }, { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x, y: bounds.y + bounds.height },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
  ].map((point) => worldToScreen(localToWorld(point, component.position, component.rotation), viewport)));
}
export function inspectorAnchor(
  components: readonly ElectronicComponent[], wires: readonly Wire[], viewport: Viewport,
  componentId: string | null, wireId: string | null,
): InspectorAnchor | null {
  const component = components.find((item) => item.id === componentId);
  const selectedWire = wires.find((item) => item.id === wireId);
  const selectedPoints = selectedWire ? wirePoints(components, selectedWire) : null;
  if (!component && !selectedPoints?.length) return null;
  const obstacles: PanelObstacle[] = components.map((item) => ({
    rect: componentScreenBounds(item, viewport), weight: item.kind === 'breadboard' ? 0.15 : 8,
  }));
  // Bound decorative placement work for large documents. Components and selected
  // geometry have priority; no electrical or editor data is changed by this heuristic.
  let segmentsRemaining = 512;
  for (const wire of wires) {
    if (segmentsRemaining <= 0) break;
    const points = wirePoints(components, wire)?.map((point) => worldToScreen(point, viewport));
    if (!points) continue;
    for (let index = 1; index < points.length && segmentsRemaining > 0; index++) {
      const a = points[index - 1], b = points[index];
      if (!a || !b) continue;
      const rect = enclosing([a, b]);
      obstacles.push({ rect: { x: rect.x - 3, y: rect.y - 3, width: rect.width + 6, height: rect.height + 6 }, weight: 0.6 });
      segmentsRemaining--;
    }
  }
  return { rect: component ? componentScreenBounds(component, viewport)
    : enclosing((selectedPoints ?? []).map((point) => worldToScreen(point, viewport))),
    protect: component !== undefined, obstacles };
}
export function placeInspector(
  canvas: { width: number; height: number }, anchor: InspectorAnchor,
  expanded: boolean, mobile: boolean,
): PanelRect {
  if (canvas.width <= 0 || canvas.height <= 0) return { x: 0, y: 0, width: 0, height: 0 };
  const margin = Math.min(mobile ? 8 : 12, canvas.width / 4, canvas.height / 4);
  const width = Math.min(mobile ? canvas.width : expanded ? 480 : 320, canvas.width - margin * 2);
  const height = Math.min(canvas.height - margin * 2, mobile
    ? expanded ? canvas.height * 0.78 : Math.max(Math.min(180, canvas.height * 0.48), canvas.height * 0.44)
    : expanded ? 680 : 430);
  if (mobile) return { x: margin, y: canvas.height - height - margin, width, height };
  const target = anchor.rect, gap = 16;
  const centerX = target.x + target.width / 2, centerY = target.y + target.height / 2;
  const clamp = (value: number, maximum: number) => Math.max(margin, Math.min(maximum - margin, value));
  const candidates = [
    { x: right(target) + gap, y: centerY - height / 2 },
    { x: target.x - width - gap, y: centerY - height / 2 },
    { x: centerX - width / 2, y: bottom(target) + gap },
    { x: centerX - width / 2, y: target.y - height - gap },
    { x: margin, y: margin }, { x: canvas.width - width - margin, y: margin },
    { x: margin, y: canvas.height - height - margin },
    { x: canvas.width - width - margin, y: canvas.height - height - margin },
  ].map((point): PanelRect => ({
    x: clamp(point.x, canvas.width - width), y: clamp(point.y, canvas.height - height), width, height,
  }));
  const protectedTarget = { x: target.x - 8, y: target.y - 8, width: target.width + 16, height: target.height + 16 };
  const score = (rect: PanelRect): number => {
    const overlap = anchor.obstacles.reduce((sum, obstacle) => sum + obstacle.weight * overlapArea(rect, obstacle.rect) /
      Math.max(1, Math.min(width * height, obstacle.rect.width * obstacle.rect.height)), 0);
    const coveredTarget = overlapArea(rect, protectedTarget) / Math.max(1, Math.min(width * height, protectedTarget.width * protectedTarget.height));
    const distanceX = Math.max(0, target.x - right(rect), rect.x - right(target));
    const distanceY = Math.max(0, target.y - bottom(rect), rect.y - bottom(target));
    const controls = { x: canvas.width - 260, y: canvas.height - 64, width: 248, height: 52 };
    const coveredControls = overlapArea(rect, controls) / (controls.width * controls.height);
    return overlap + coveredTarget * (anchor.protect ? 1000 : 1) + coveredControls * 30 + Math.hypot(distanceX, distanceY) / 800;
  };
  const first = candidates[0];
  if (!first) throw new Error('missing-inspector-placement');
  return candidates.reduce((best, candidate) => score(candidate) < score(best) - 1e-8 ? candidate : best, first);
}
