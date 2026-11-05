import { applyProgramFileAction, sourceFiles } from './programFiles';
import type { ProgramFileAction } from './programFiles';
import type { CircuitProject, ElectronicComponent, Point, VirtualNetworkConfig, Wire } from './types';
import { componentDefinitions, isBoardComponent, pinWorldPosition } from './components';
import { localToWorld } from './coordinates';
import { parseProject } from './project';
import { planComponentMove, planInsertion, reconcilePlacements, withoutAttachments } from './breadboard';

type EditableComponent = Exclude<
  ElectronicComponent,
  { kind: 'arduino-uno' | 'esp8266' | 'breadboard' }
>;
type PropertiesOf<T extends ElectronicComponent> = T extends ElectronicComponent
  ? Pick<T, 'kind' | 'properties'>
  : never;
export type ComponentPropertyUpdate = PropertiesOf<EditableComponent>;
export type EditorSnapshot = Pick<CircuitProject, 'components' | 'wires' | 'programs'>;
export type EditorCommand =
  | { type: 'add'; component: ElectronicComponent; snap?: boolean }
  | { type: 'move'; positions: Record<string, Point> }
  | { type: 'place'; positions: Record<string, Point> }
  | { type: 'rotate'; ids: string[] }
  | { type: 'delete'; componentIds: string[]; wireIds: string[] }
  | {
      type: 'duplicate';
      components: { originalId: string; newId: string }[];
      wires: { originalId: string; newId: string }[];
    }
  | { type: 'properties'; id: string; update: ComponentPropertyUpdate }
  | { type: 'program-file'; id: string; action: ProgramFileAction }
  | { type: 'program'; id: string; source: string }
  | { type: 'network'; id: string; config: VirtualNetworkConfig | null }
  | { type: 'add-wire'; wire: Wire }
  | { type: 'wire'; id: string; color: string; waypoints: Point[] };

export function editorSnapshot(project: CircuitProject): EditorSnapshot {
  return { components: project.components, wires: project.wires, programs: project.programs };
}
export function applyEditorCommand(
  project: CircuitProject,
  command: EditorCommand,
): CircuitProject {
  let candidate: CircuitProject = project;
  switch (command.type) {
    case 'add': {
      const insertion = command.snap ? planInsertion(project.components, command.component) : null;
      if (insertion && !insertion.valid) throw new Error('invalid-breadboard-placement');
      candidate = { ...project, components: [...project.components, insertion?.component ?? command.component] };
      break;
    }
    case 'place':
    case 'move': {
      const plan = planComponentMove(project.components, command.positions, command.type === 'place');
      if (!plan.valid) throw new Error('invalid-breadboard-placement');
      candidate = { ...project, components: plan.components };
      break;
    }
    case 'rotate':
      candidate = {
        ...project,
        components: project.components.map((item) => {
          if (!command.ids.includes(item.id)) return item;
          const definition = componentDefinitions[item.kind];
          const center = { x: definition.width / 2, y: definition.height / 2 };
          const worldCenter = localToWorld(center, item.position, item.rotation);
          const rotation = (((item.rotation + 90) % 360) + 360) % 360;
          const rotatedCenter = localToWorld(center, { x: 0, y: 0 }, rotation);
          return {
            ...item,
            rotation,
            position: { x: worldCenter.x - rotatedCenter.x, y: worldCenter.y - rotatedCenter.y },
          };
        }),
      };
      {
        const plan = reconcilePlacements(project.components, candidate.components, new Set(command.ids), false);
        if (!plan.valid) throw new Error('invalid-breadboard-placement');
        candidate = { ...candidate, components: plan.components };
      }
      break;
    case 'delete':
      candidate = {
        ...project,
        components: project.components.filter((item) => !command.componentIds.includes(item.id)).map((item) =>
          item.attachments?.some((lead) => command.componentIds.includes(lead.breadboardId)) ? withoutAttachments(item) : item),
        wires: project.wires.filter(
          (item) =>
            !command.wireIds.includes(item.id) &&
            !command.componentIds.includes(item.from.componentId) &&
            !command.componentIds.includes(item.to.componentId),
        ),
        programs: project.programs.filter(
          (item) => !command.componentIds.includes(item.componentId),
        ),
      };
      break;
    case 'duplicate': {
      const mappings = new Map(command.components.map((item) => [item.originalId, item.newId]));
      const wireMappings = new Map(command.wires.map((item) => [item.originalId, item.newId]));
      const copies = project.components
        .filter((item) => mappings.has(item.id))
        .map((item) => ({
          ...withoutAttachments(item),
          id: mappings.get(item.id) ?? item.id,
          position: { x: item.position.x + 25, y: item.position.y + 25 },
          ...(item.attachments?.every((lead) => mappings.has(lead.breadboardId)) ? {
            attachments: item.attachments.map((lead) => ({ ...lead, breadboardId: mappings.get(lead.breadboardId) ?? lead.breadboardId })),
          } : {}),
        }));
      const copiesOfWires = project.wires
        .filter((item) => mappings.has(item.from.componentId) && mappings.has(item.to.componentId))
        .map((item) => {
          const id = wireMappings.get(item.id);
          if (!id) throw new Error('missing-duplicate-wire-id');
          return {
            ...item,
            id,
            from: { ...item.from, componentId: mappings.get(item.from.componentId) ?? '' },
            to: { ...item.to, componentId: mappings.get(item.to.componentId) ?? '' },
            waypoints: item.waypoints.map((p) => ({ x: p.x + 25, y: p.y + 25 })),
          };
        });
      candidate = {
        ...project,
        components: [...project.components, ...copies],
        wires: [...project.wires, ...copiesOfWires],
        programs: [
          ...project.programs,
          ...project.programs
            .filter((item) => mappings.has(item.componentId))
            .map((item) => ({ ...item, componentId: mappings.get(item.componentId) ?? '' })),
        ],
      };
      break;
    }
    case 'network': {
      const target = project.components.find((item) => item.id === command.id);
      if (target?.kind !== 'esp8266') throw new Error('invalid-network-component');
      candidate = { ...project, components: project.components.map((item) => {
        if (item.id !== command.id || item.kind !== 'esp8266') return item;
        return { ...item, properties: { logicVoltage: 3.3,
          ...(command.config ? { virtualNetwork: command.config } : {}) } };
      }) };
      break;
    }
    case 'properties':
      candidate = {
        ...project,
        components: project.components.map((item) =>
          item.id === command.id && item.kind === command.update.kind
            ? { ...item, ...command.update }
            : item,
        ),
      };
      break;
    case 'program-file': {
      if (!project.components.some((component) => component.id === command.id && isBoardComponent(component))) throw new Error('code-target-not-board');
      const previous = project.programs.find((program) => program.componentId === command.id);
      const program = applyProgramFileAction(command.id, previous, command.action);
      candidate = { ...project, programs: [...project.programs.filter((item) => item.componentId !== command.id), program] };
      break;
    }
    case 'program': {
      if (!project.components.some((component) => component.id === command.id && isBoardComponent(component)))
        throw new Error('code-target-not-board');
      const previous = project.programs.find((program) => program.componentId === command.id);
      const first = previous?.files ? sourceFiles(previous)[0] : undefined;
      if (first) {
        const program = applyProgramFileAction(command.id, previous, { type: 'edit', name: first.name, source: command.source });
        candidate = { ...project, programs: [...project.programs.filter((item) => item.componentId !== command.id), program] };
        break;
      }
      candidate = { ...project, programs: [...project.programs.filter((program) => program.componentId !== command.id), {
        componentId: command.id, language: 'arduino-cpp', source: command.source, execution: 'unavailable',
      }] };
      break;
    }
    case 'add-wire': {
      if (
        project.wires.some(
          (item) =>
            (samePin(item.from, command.wire.from) && samePin(item.to, command.wire.to)) ||
            (samePin(item.to, command.wire.from) && samePin(item.from, command.wire.to)),
        )
      )
        throw new Error('duplicate-wire');
      candidate = { ...project, wires: [...project.wires, command.wire] };
      break;
    }
    case 'wire':
      candidate = {
        ...project,
        wires: project.wires.map((item) =>
          item.id === command.id
            ? { ...item, color: command.color, waypoints: command.waypoints }
            : item,
        ),
      };
      break;
  }
  if (JSON.stringify(candidate) === JSON.stringify(project)) return project;
  const validated = parseProject(JSON.stringify(candidate));
  // Code does not change physical/electrical data. Keep these references stable
  // so editing a board's source cannot reset a running circuit.
  return command.type === 'program' || command.type === 'program-file' ? { ...project, programs: validated.programs } : validated;
}
export function samePin(a: Wire['from'], b: Wire['from']): boolean {
  return a.componentId === b.componentId && a.pinId === b.pinId;
}
/** A deterministic Manhattan route through user-authored world-space anchors. */
export function wirePoints(components: readonly ElectronicComponent[], wire: Wire): Point[] | null {
  const from = pinWorldPosition(components, wire.from);
  const to = pinWorldPosition(components, wire.to);
  if (!from || !to) return null;
  return orthogonalRoute([from, ...wire.waypoints, to]);
}
export function orthogonalRoute(anchors: Point[]): Point[] {
  return anchors.flatMap((point, i) => {
    const next = anchors[i + 1];
    if (!next) return [point];
    const middleX = (point.x + next.x) / 2;
    return [point, { x: middleX, y: point.y }, { x: middleX, y: next.y }];
  });
}
