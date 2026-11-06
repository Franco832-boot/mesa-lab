import { componentDefinitions, getPin } from './components';
import { localToWorld, worldToLocal } from './coordinates';
import { CONTACT_PITCH_MM, millimetersToWorld } from './physical';
import type { ComponentKind, ElectronicComponent, LeadAttachment, PinReference, Point } from './types';

const EPSILON = 1e-4;
export const INSERTION_DISTANCE = millimetersToWorld(CONTACT_PITCH_MM) * 0.8;
export const canInsert = (kind: ComponentKind): boolean =>
  kind === 'resistor' || kind === 'led' || kind === 'pushbutton' || kind === 'potentiometer' || kind === 'dht11';
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const holeKey = (board: string, hole: string) => JSON.stringify([board, hole]);
export interface InsertionPlan {
  valid: boolean;
  attempted: boolean;
  component: ElectronicComponent;
  holes: PinReference[];
}
export function withoutAttachments(component: ElectronicComponent): ElectronicComponent {
  const { attachments: _attachments, ...rest } = component;
  return rest;
}
/** Uses actual registry holes and rigid lead geometry, never row/proximity conductivity. */
export function planInsertion(
  components: readonly ElectronicComponent[],
  component: ElectronicComponent,
  options: { breadboardId?: string; preferredBreadboardId?: string } = {},
): InsertionPlan {
  const free = withoutAttachments(component);
  if (!canInsert(component.kind)) return { valid: true, attempted: false, component: free, holes: [] };
  const leads = componentDefinitions[component.kind].pins;
  const first = leads[0];
  if (!first) return { valid: false, attempted: false, component: free, holes: [] };
  const leadPoints = leads.map((pin) => localToWorld(pin.position, component.position, component.rotation));
  const firstPoint = leadPoints[0];
  if (!firstPoint) throw new Error('missing-insertion-lead');
  const occupied = new Set(components.filter((item) => item.id !== component.id)
    .flatMap((item) => (item.attachments ?? []).map((lead) => holeKey(lead.breadboardId, lead.holeId))));
  let attempted = false;
  let best: { score: number; component: ElectronicComponent; holes: PinReference[] } | undefined;
  const boards = components.filter((item) => item.kind === 'breadboard' &&
    (!options.breadboardId || item.id === options.breadboardId))
    .sort((a, b) => a.id === options.preferredBreadboardId ? -1 : b.id === options.preferredBreadboardId ? 1
      : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  for (const board of boards) {
    const definition = componentDefinitions.breadboard;
    const center = localToWorld({ x: componentDefinitions[component.kind].width / 2,
      y: componentDefinitions[component.kind].height / 2 }, component.position, component.rotation);
    const within = (world: Point) => {
      const point = worldToLocal(world, board.position, board.rotation);
      return point.x >= 0 && point.y >= 0 && point.x <= definition.width && point.y <= definition.height;
    };
    attempted ||= leadPoints.some(within) || within(center);
    const holes = definition.pins.map((pin) => ({ id: pin.id,
      position: localToWorld(pin.position, board.position, board.rotation) }));
    for (const anchor of holes) {
      const score = distance(firstPoint, anchor.position);
      if (score > INSERTION_DISTANCE || (best && score >= best.score - EPSILON)) continue;
      const delta = { x: anchor.position.x - firstPoint.x, y: anchor.position.y - firstPoint.y };
      const attachments: LeadAttachment[] = [];
      const used = new Set<string>();
      for (let index = 0; index < leads.length; index++) {
        const point = leadPoints[index], lead = leads[index];
        if (!point || !lead) continue;
        const target = { x: point.x + delta.x, y: point.y + delta.y };
        const hole = holes.find((candidate) => distance(candidate.position, target) < EPSILON);
        if (!hole || used.has(hole.id) || occupied.has(holeKey(board.id, hole.id))) break;
        used.add(hole.id);
        attachments.push({ pinId: lead.id, breadboardId: board.id, holeId: hole.id });
      }
      if (attachments.length !== leads.length) continue;
      best = { score, component: { ...free,
        position: { x: component.position.x + delta.x, y: component.position.y + delta.y }, attachments },
        holes: attachments.map((lead) => ({ componentId: lead.breadboardId, pinId: lead.holeId })) };
    }
  }
  if (best) return { valid: true, attempted: true, component: best.component, holes: best.holes };
  return { valid: !attempted, attempted, component: free, holes: [] };
}
export interface MovePlan {
  valid: boolean;
  attempted: boolean;
  components: ElectronicComponent[];
  holes: PinReference[];
  affectedIds: string[];
}
/** Carries mounted parts with a board, then atomically reconciles every changed footprint. */
export function reconcilePlacements(
  before: readonly ElectronicComponent[],
  proposed: readonly ElectronicComponent[],
  changedIds: ReadonlySet<string>,
  snapFree = true,
): MovePlan {
  const original = new Map(before.map((item) => [item.id, item]));
  const changed = new Set(changedIds);
  const carried = proposed.map((item): ElectronicComponent => {
    const mount = item.attachments?.[0];
    const oldBoard = mount ? original.get(mount.breadboardId) : undefined;
    const newBoard = mount ? proposed.find((candidate) => candidate.id === mount.breadboardId) : undefined;
    if (!oldBoard || !newBoard || !changedIds.has(newBoard.id) ||
      (changedIds.has(item.id) && oldBoard.rotation === newBoard.rotation)) return item;
    changed.add(item.id);
    const mounted = original.get(item.id) ?? item;
    return { ...item,
      position: localToWorld(worldToLocal(mounted.position, oldBoard.position, oldBoard.rotation), newBoard.position, newBoard.rotation),
      rotation: ((mounted.rotation + newBoard.rotation - oldBoard.rotation) % 360 + 360) % 360 };
  });
  // Release all moved leads before checking occupancy, including moving groups.
  let components = carried.map((item) => changed.has(item.id) ? withoutAttachments(item) : item);
  let attempted = false;
  const holes: PinReference[] = [];
  for (const item of [...carried].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) {
    if (!changed.has(item.id) || !canInsert(item.kind)) continue;
    if (!snapFree && !original.get(item.id)?.attachments?.length) continue;
    const parent = original.get(item.id)?.attachments?.[0]?.breadboardId;
    const plan = planInsertion(components, item, {
      ...(parent ? { preferredBreadboardId: parent } : {}),
      ...(parent && changedIds.has(parent) ? { breadboardId: parent } : {}),
    });
    attempted ||= plan.attempted;
    if (!plan.valid) return { valid: false, attempted, components: [...proposed], holes: [], affectedIds: [...changed] };
    components = components.map((candidate) => candidate.id === item.id ? plan.component : candidate);
    holes.push(...plan.holes);
  }
  return { valid: true, attempted, components, holes, affectedIds: [...changed] };
}
export function planComponentMove(
  components: readonly ElectronicComponent[], positions: Readonly<Record<string, Point>>, snapFree = true,
): MovePlan {
  const changed = new Set(Object.keys(positions));
  const proposed = components.map((item) => Object.hasOwn(positions, item.id)
    ? { ...item, position: positions[item.id] ?? item.position } : item);
  return reconcilePlacements(components, proposed, changed, snapFree);
}
/** Validate the optional v1 attachment extension, including alignment and occupancy. */
export function validateAttachments(components: readonly ElectronicComponent[]): void {
  const occupied = new Set<string>();
  const owners = new Map(components.map((item) => [item.id, item]));
  for (const item of components) {
    const attachments = item.attachments;
    if (!attachments?.length) continue;
    const leads = componentDefinitions[item.kind].pins;
    if (!canInsert(item.kind) || attachments.length !== leads.length ||
      new Set(attachments.map((lead) => lead.pinId)).size !== leads.length ||
      new Set(attachments.map((lead) => lead.breadboardId)).size !== 1)
      throw new Error('invalid-lead-attachments');
    for (const lead of attachments) {
      const board = owners.get(lead.breadboardId);
      const pin = getPin(item.kind, lead.pinId), hole = getPin('breadboard', lead.holeId);
      const key = holeKey(lead.breadboardId, lead.holeId);
      if (!board || board.kind !== 'breadboard' || !pin || !hole || occupied.has(key) ||
        distance(localToWorld(pin.position, item.position, item.rotation), localToWorld(hole.position, board.position, board.rotation)) > EPSILON)
        throw new Error('invalid-lead-attachments');
      occupied.add(key);
    }
  }
}
