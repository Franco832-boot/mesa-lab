import { validPcfAddress } from './lcd';
import type {
  BoardProgram,
  CircuitProject,
  ElectronicComponent,
  PinReference,
  Point,
  Wire,
} from './types';
import { MAX_ZOOM, MIN_ZOOM } from './coordinates';
import { canonicalPinId, getPin, newId } from './components';
import { normalizeVirtualNetworkConfig, validateVirtualNetworkConfig } from './virtualNetwork';
import { MAX_PROGRAM_SOURCE_LENGTH, validProgramFiles } from './programFiles';
export { MAX_PROGRAM_SOURCE_LENGTH } from './programFiles';
import { validateAttachments } from './breadboard';
import { validDhtEnvironment } from './dht11';
import { migrateDht11Modules } from './dht11Migration';

export const STORAGE_KEY = 'mesa.project.v1';
export const MAX_PROJECT_BYTES = 2_000_000;

/** An unpowered reference layout, not a connected or simulated circuit. */
export function createProject(projectId?: string): CircuitProject {
  // getRandomValues also works for a tablet opening Vite over an HTTP LAN,
  // where the secure-context-only randomUUID method may be unavailable.
  const generatedId = projectId ?? newId();
  return {
    format: 'mesa-circuit',
    version: 1,
    id: generatedId,
    name: '',
    components: [
      {
        id: 'uno-reference',
        kind: 'arduino-uno',
        position: { x: 95, y: 145 },
        rotation: 0,
        properties: { logicVoltage: 5 },
      },
      {
        id: 'esp-reference',
        kind: 'esp8266',
        position: { x: 515, y: 108 },
        rotation: 0,
        properties: { logicVoltage: 3.3 },
      },
      {
        id: 'breadboard-reference',
        kind: 'breadboard',
        position: { x: 135, y: 475 },
        rotation: 0,
        properties: { columns: 63 },
      },
    ],
    wires: [],
    programs: [],
    viewport: { offset: { x: 0, y: 0 }, zoom: 1 },
  };
}

/** A blank independent document; reference-layout reset remains unchanged. */
export function createEmptyProject(name: string, projectId?: string): CircuitProject {
  return { ...createProject(projectId), name, components: [], wires: [], programs: [] };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
function point(value: unknown): value is Point {
  return (
    record(value) &&
    finite(value.x) &&
    finite(value.y) &&
    Math.abs(value.x) <= 1e7 &&
    Math.abs(value.y) <= 1e7
  );
}
function id(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200;
}
function validProperties(kind: unknown, value: unknown): boolean {
  if (!record(value)) return false;
  switch (kind) {
    case 'dc-motor': return finite(value.resistance) && value.resistance >= 0.01 && value.resistance <= 1e6 &&
      finite(value.nominalVoltage) && value.nominalVoltage > 0 && value.nominalVoltage <= 60 &&
      finite(value.maxCurrent) && value.maxCurrent > 0 && value.maxCurrent <= 100;
    case 'battery-9v': return finite(value.voltage) && value.voltage >= 0 && value.voltage <= 60 &&
      (value.internalResistance === undefined || (finite(value.internalResistance) && value.internalResistance >= 0 && value.internalResistance <= 1e6)) &&
      finite(value.maxCurrent) && value.maxCurrent > 0 && value.maxCurrent <= 100;
    case 'l293d': return value.model === 'L293D';
    case 'arduino-uno':
      return value.logicVoltage === 5;
    case 'esp8266':
      return (
        value.logicVoltage === 3.3 &&
        (value.virtualNetwork === undefined || validateVirtualNetworkConfig(value.virtualNetwork))
      );
    case 'breadboard':
      return value.columns === 63;
    case 'led':
      return ['red', 'green', 'blue', 'yellow'].some((color) => value.color === color);
    case 'resistor':
      return finite(value.resistance) && value.resistance > 0;
    case 'pushbutton':
      return typeof value.normallyClosed === 'boolean';
    case 'potentiometer':
      return (
        finite(value.resistance) &&
        value.resistance > 0 &&
        finite(value.ratio) &&
        value.ratio >= 0 &&
        value.ratio <= 1
      );
    case 'power-supply':
      return finite(value.voltage) && value.voltage >= 0 && value.voltage <= 60;
    case 'pcf8574': return finite(value.address) && validPcfAddress(value.address) && finite(value.contrast) && value.contrast >= 0 && value.contrast <= 1;
    case 'lcd-20x4': case 'lcd-16x2': return value.controller === 'HD44780';
    case 'dht11': return finite(value.temperature) && finite(value.humidity) && validDhtEnvironment({ temperature: value.temperature, humidity: value.humidity });
    default:
      return false;
  }
}
function component(value: unknown): value is ElectronicComponent {
  return (
    record(value) &&
    id(value.id) &&
    point(value.position) &&
    finite(value.rotation) &&
    (value.attachments === undefined ||
      (Array.isArray(value.attachments) &&
        value.attachments.length <= 16 &&
        value.attachments.every(
          (lead: unknown) =>
            record(lead) && id(lead.pinId) && id(lead.breadboardId) && id(lead.holeId),
        ))) &&
    validProperties(value.kind, value.properties)
  );
}

// Backward-compatible v1 extension migration: a missing attachment list remains
// absent (unmounted), preserving old files exactly; present lists are normalized
// and validated together against the current physical registry below.
function normalizeComponent(item: ElectronicComponent): ElectronicComponent {
  const base = {
    id: item.id,
    position: { x: item.position.x, y: item.position.y },
    rotation: item.rotation,
    ...(item.attachments?.length
      ? {
          attachments: item.attachments.map((lead) => ({
            pinId: lead.pinId,
            breadboardId: lead.breadboardId,
            holeId: lead.holeId,
          })),
        }
      : {}),
  };
  switch (item.kind) {
    case 'dc-motor': return { ...base, kind: item.kind, properties: { resistance: item.properties.resistance, nominalVoltage: item.properties.nominalVoltage, maxCurrent: item.properties.maxCurrent } };
    case 'battery-9v': return { ...base, kind: item.kind, properties: { voltage: item.properties.voltage, maxCurrent: item.properties.maxCurrent,
      ...(item.properties.internalResistance !== undefined ? { internalResistance: item.properties.internalResistance } : {}) } };
    case 'l293d': return { ...base, kind: item.kind, properties: { model: 'L293D' } };
    case 'pcf8574': return { ...base, kind: item.kind, properties: { address: item.properties.address, contrast: item.properties.contrast } };
    case 'lcd-20x4': case 'lcd-16x2': return { ...base, kind: item.kind, properties: { controller: 'HD44780' } };
    case 'dht11': return { ...base, kind: item.kind, properties: { temperature: item.properties.temperature, humidity: item.properties.humidity } };
    case 'arduino-uno':
      return { ...base, kind: item.kind, properties: { logicVoltage: 5 } };
    case 'esp8266':
      return {
        ...base,
        kind: item.kind,
        properties: {
          logicVoltage: 3.3,
          ...(item.properties.virtualNetwork
            ? { virtualNetwork: normalizeVirtualNetworkConfig(item.properties.virtualNetwork) }
            : {}),
        },
      };
    case 'breadboard':
      return { ...base, kind: item.kind, properties: { columns: 63 } };
    case 'led':
      return { ...base, kind: item.kind, properties: { color: item.properties.color } };
    case 'resistor':
      return { ...base, kind: item.kind, properties: { resistance: item.properties.resistance } };
    case 'pushbutton':
      return {
        ...base,
        kind: item.kind,
        properties: { normallyClosed: item.properties.normallyClosed },
      };
    case 'potentiometer':
      return {
        ...base,
        kind: item.kind,
        properties: { resistance: item.properties.resistance, ratio: item.properties.ratio },
      };
    case 'power-supply':
      return { ...base, kind: item.kind, properties: { voltage: item.properties.voltage } };
  }
}
function pinReference(value: unknown): value is PinReference {
  return record(value) && id(value.componentId) && id(value.pinId);
}
function wire(value: unknown): value is Wire {
  return (
    record(value) &&
    id(value.id) &&
    pinReference(value.from) &&
    pinReference(value.to) &&
    typeof value.color === 'string' &&
    /^#[0-9a-fA-F]{6}$/.test(value.color) &&
    Array.isArray(value.waypoints) &&
    value.waypoints.length <= 100 &&
    value.waypoints.every(point)
  );
}
function program(value: unknown): value is BoardProgram {
  return (
    record(value) &&
    id(value.componentId) &&
    value.language === 'arduino-cpp' &&
    value.execution === 'unavailable' &&
    typeof value.source === 'string' &&
    value.source.length <= MAX_PROGRAM_SOURCE_LENGTH &&
    validProgramFiles({
      source: value.source,
      ...(value.files === undefined ? {} : { files: value.files }),
      ...(value.activeFile === undefined ? {} : { activeFile: value.activeFile }),
    })
  );
}

/** Validate unknown file/storage input before it reaches React or the domain. */
export function parseProject(source: string): CircuitProject {
  if (new TextEncoder().encode(source).length > MAX_PROJECT_BYTES)
    throw new Error('project-too-large');
  const value: unknown = JSON.parse(source);
  if (!record(value) || value.format !== 'mesa-circuit' || value.version !== 1)
    throw new Error('unsupported-format');
  if (
    !id(value.id) ||
    typeof value.name !== 'string' ||
    value.name.length > 100 ||
    !Array.isArray(value.components) ||
    value.components.length > 500 ||
    !value.components.every(component) ||
    !Array.isArray(value.wires) ||
    value.wires.length > 2000 ||
    !value.wires.every(wire) ||
    !Array.isArray(value.programs) ||
    !value.programs.every(program) ||
    !record(value.viewport) ||
    !point(value.viewport.offset) ||
    !finite(value.viewport.zoom) ||
    value.viewport.zoom < MIN_ZOOM ||
    value.viewport.zoom > MAX_ZOOM
  )
    throw new Error('invalid-project');
  const migrated = migrateDht11Modules(value.components.map(normalizeComponent), value.wires);
  const components = migrated.components;
  const ids = new Set(components.map((item) => item.id));
  if (ids.size !== components.length) throw new Error('duplicate-component');
  validateAttachments(components);
  const wires: Wire[] = migrated.wires.map((item: Wire) => {
    const normalizePin = (reference: PinReference): PinReference => {
      const owner = components.find((component) => component.id === reference.componentId);
      return {
        ...reference,
        pinId: owner ? canonicalPinId(owner.kind, reference.pinId) : reference.pinId,
      };
    };
    return { ...item, from: normalizePin(item.from), to: normalizePin(item.to) };
  });
  const programs: BoardProgram[] = value.programs;
  if (
    new Set(wires.map((item) => item.id)).size !== wires.length ||
    wires.some(
      (item) =>
        !ids.has(item.from.componentId) ||
        !ids.has(item.to.componentId) ||
        (item.from.componentId === item.to.componentId && item.from.pinId === item.to.pinId),
    )
  )
    throw new Error('invalid-wire-reference');
  if (
    wires.some((item) =>
      [item.from, item.to].some((reference) => {
        const owner = components.find((component) => component.id === reference.componentId);
        return !owner || !getPin(owner.kind, reference.pinId);
      }),
    )
  )
    throw new Error('invalid-pin-reference');
  if (
    new Set(programs.map((item) => item.componentId)).size !== programs.length ||
    programs.some(
      (item) =>
        !components.some(
          (board) =>
            board.id === item.componentId &&
            (board.kind === 'arduino-uno' || board.kind === 'esp8266'),
        ),
    )
  )
    throw new Error('invalid-program-reference');
  return {
    format: 'mesa-circuit',
    version: 1,
    id: value.id,
    name: value.name,
    components,
    wires: wires.map((item) => ({
      id: item.id,
      from: { componentId: item.from.componentId, pinId: item.from.pinId },
      to: { componentId: item.to.componentId, pinId: item.to.pinId },
      color: item.color,
      waypoints: item.waypoints.map((p) => ({ x: p.x, y: p.y })),
    })),
    programs: programs.map((item) => ({
      componentId: item.componentId,
      language: item.language,
      source: item.source,
      execution: 'unavailable',
      ...(item.files === undefined
        ? {}
        : {
            files: item.files.map((file) => ({ name: file.name, source: file.source })),
            activeFile: item.activeFile ?? null,
          }),
    })),
    viewport: { offset: value.viewport.offset, zoom: value.viewport.zoom },
  };
}
export function serializeProject(project: CircuitProject): string {
  return JSON.stringify(parseProject(JSON.stringify(project)), null, 2);
}
