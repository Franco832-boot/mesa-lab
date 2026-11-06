import { getPin } from './components';
import { localToWorld } from './coordinates';
import { withoutAttachments } from './breadboard';
import type { ElectronicComponent, Wire } from './types';

// Frozen geometry of the previous v1 SIP-4 component, in world units.
const sip4Leads = [
  { id: 'VCC', position: { x: 8.76, y: 82 } },
  { id: 'DATA', position: { x: 18.92, y: 82 } },
  { id: 'NC', position: { x: 29.08, y: 82 } },
  { id: 'GND', position: { x: 39.24, y: 82 } },
] as const;

/** Preserve old mounted contacts as explicit wires: the new header cannot
 * occupy the four old holes in its different order. Free wired sensors keep
 * their semantic terminal IDs and need no migration. Never mutate input data.
 */
export function migrateDht11Modules(components: ElectronicComponent[], wires: Wire[]): {
  components: ElectronicComponent[]; wires: Wire[];
} {
  const legacy = components.filter((item) => item.kind === 'dht11' && item.attachments?.some((lead) => lead.pinId === 'NC'));
  if (!legacy.length) return { components, wires };
  const occupied = new Set<string>();
  for (const item of components) for (const lead of item.attachments ?? []) {
    const key = JSON.stringify([lead.breadboardId, lead.holeId]);
    if (occupied.has(key)) throw new Error('invalid-lead-attachments');
    occupied.add(key);
  }
  const additions: Wire[] = [];
  const ids = new Set(wires.map((wire) => wire.id));
  let sequence = 0;
  const migrated = new Set<string>();
  let normalizedWires = wires;
  for (const item of legacy) {
    const attachments = item.attachments ?? [];
    if (attachments.length !== 4 || new Set(attachments.map((lead) => lead.pinId)).size !== 4 ||
      new Set(attachments.map((lead) => lead.breadboardId)).size !== 1) throw new Error('invalid-lead-attachments');
    for (const lead of attachments) {
      const oldPin = sip4Leads.find((pin) => pin.id === lead.pinId);
      const board = components.find((candidate) => candidate.id === lead.breadboardId);
      const hole = getPin('breadboard', lead.holeId);
      if (!oldPin || board?.kind !== 'breadboard' || !hole) throw new Error('invalid-lead-attachments');
      const contact = localToWorld(oldPin.position, item.position, item.rotation);
      const target = localToWorld(hole.position, board.position, board.rotation);
      if (Math.hypot(contact.x - target.x, contact.y - target.y) > 1e-4) throw new Error('invalid-lead-attachments');
      if (lead.pinId === 'NC') {
        // The old unused lead was a contact on this hole, never a sensor input.
        const replace = (pin: Wire['from']) => pin.componentId === item.id && pin.pinId === 'NC'
          ? { componentId: board.id, pinId: lead.holeId } : pin;
        normalizedWires = normalizedWires.map((wire) => ({ ...wire, from: replace(wire.from), to: replace(wire.to) }));
        continue;
      }
      let id: string;
      do { id = `dht11-mount-${sequence++}`; } while (ids.has(id));
      ids.add(id);
      additions.push({ id, from: { componentId: item.id, pinId: lead.pinId },
        to: { componentId: board.id, pinId: lead.holeId }, color: '#668c75', waypoints: [] });
    }
    migrated.add(item.id);
  }
  if (wires.length + additions.length > 2000) throw new Error('invalid-project');
  return { components: components.map((item) => migrated.has(item.id) ? withoutAttachments(item) : item),
    wires: [...normalizedWires, ...additions] };
}
