import { componentDefinitions, getPin } from '../model/components';
import type { CircuitProject, PinReference } from '../model/types';
import type { SimulationInputs, SimulationIssue } from './types';
import { validateAttachments } from '../model/breadboard';

export function ownInput<T>(record: Readonly<Record<string, T>> | undefined, key: string): T | undefined {
  return record && Object.hasOwn(record, key) ? record[key] : undefined;
}

/** JSON tuples remain unambiguous even when imported IDs contain punctuation. */
export const pinKey = (componentId: string, pinId: string): string =>
  JSON.stringify([componentId, pinId]);

export class UnionFind {
  private readonly parents = new Map<string, string>();
  add(key: string): void {
    if (!this.parents.has(key)) this.parents.set(key, key);
  }
  find(key: string): string {
    const parent = this.parents.get(key);
    if (parent === undefined) throw new Error('unknown-topology-key');
    if (parent === key) return key;
    const root = this.find(parent);
    this.parents.set(key, root);
    return root;
  }
  union(a: string, b: string): void {
    const left = this.find(a);
    const right = this.find(b);
    // Lexical roots make results independent of wire and component order.
    if (left !== right) this.parents.set(left < right ? right : left, left < right ? left : right);
  }
}
export interface ElectricalTopology {
  nodeByPin: ReadonlyMap<string, string>;
  pinsByNode: ReadonlyMap<string, readonly PinReference[]>;
  connectedPins: ReadonlySet<string>;
  diagnostics: readonly SimulationIssue[];
}
export function resolveTopology(
  project: CircuitProject,
  inputs: SimulationInputs = {},
): ElectricalTopology {
  const sets = new UnionFind();
  const references = new Map<string, PinReference>();
  const components = new Map(project.components.map((component) => [component.id, component]));
  const diagnostics: SimulationIssue[] = [];
  const connectedPins = new Set<string>();
  for (const component of project.components) {
    const definition = componentDefinitions[component.kind];
    for (const pin of definition.pins) {
      const key = pinKey(component.id, pin.id);
      sets.add(key);
      references.set(key, { componentId: component.id, pinId: pin.id });
    }
    const join = (ids: readonly string[]) => {
      const first = ids[0];
      if (first === undefined) return;
      for (const id of ids.slice(1)) sets.union(pinKey(component.id, first), pinKey(component.id, id));
    };
    for (const group of definition.contactGroups) join(group.pinIds);
    if (component.kind === 'pushbutton') {
      const pressed = ownInput(inputs.buttons, component.id) ?? false;
      if (component.properties.normallyClosed !== pressed) join(['1', '2']);
    }
    if (component.kind === 'potentiometer') {
      const ratio = ownInput(inputs.potentiometers, component.id) ?? component.properties.ratio;
      if (ratio === 0) join(['1', 'wiper']);
      if (ratio === 1) join(['wiper', '3']);
    }
  }
  try {
    validateAttachments(project.components);
    for (const component of project.components) for (const lead of component.attachments ?? []) {
      const from = pinKey(component.id, lead.pinId);
      const to = pinKey(lead.breadboardId, lead.holeId);
      sets.union(from, to);
      connectedPins.add(from);
      connectedPins.add(to);
    }
  } catch {
    diagnostics.push({ code: 'invalid-reference', severity: 'error',
      componentIds: project.components.filter((item) => item.attachments?.length).map((item) => item.id), pinIds: [] });
  }
  for (const wire of project.wires) {
    const valid = (reference: PinReference) => {
      const component = components.get(reference.componentId);
      return component !== undefined && getPin(component.kind, reference.pinId) !== undefined;
    };
    if (!valid(wire.from) || !valid(wire.to)) {
      diagnostics.push({
        code: 'invalid-reference', severity: 'error',
        componentIds: [wire.from.componentId, wire.to.componentId],
        pinIds: [wire.from.pinId, wire.to.pinId],
      });
      continue;
    }
    const from = pinKey(wire.from.componentId, wire.from.pinId);
    const to = pinKey(wire.to.componentId, wire.to.pinId);
    sets.union(from, to);
    connectedPins.add(from);
    connectedPins.add(to);
  }
  const nodeByPin = new Map<string, string>();
  const pinsByNode = new Map<string, PinReference[]>();
  for (const [key, reference] of [...references].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    const node = sets.find(key);
    nodeByPin.set(key, node);
    const pins = pinsByNode.get(node) ?? [];
    pins.push(reference);
    pinsByNode.set(node, pins);
  }
  for (const component of project.components) {
    if (component.kind === 'breadboard') continue;
    const used = componentDefinitions[component.kind].pins.some((pin) =>
      connectedPins.has(pinKey(component.id, pin.id)),
    );
    if (!used) diagnostics.push({
      code: 'disconnected-component', severity: 'warning', componentIds: [component.id], pinIds: [],
    });
  }
  return { nodeByPin, pinsByNode, connectedPins, diagnostics };
}
