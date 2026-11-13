export interface Point {
  x: number;
  y: number;
}
export interface Viewport {
  offset: Point;
  zoom: number;
}
export type BoardKind = 'arduino-uno' | 'esp8266';
export type ComponentKind =
  | BoardKind
  | 'breadboard'
  | 'led'
  | 'resistor'
  | 'pushbutton'
  | 'potentiometer'
  | 'pcf8574'
  | 'lcd-16x2'
  | 'lcd-20x4'
  | 'dht11'
  | 'dc-motor'
  | 'l293d'
  | 'battery-9v'
  | 'power-supply';
export type ElectricalPinType =
  | 'digital'
  | 'analog'
  | 'power'
  | 'ground'
  | 'passive'
  | 'control'
  | 'reserved';
export type LogicLevel = 'HIGH' | 'LOW' | 'FLOATING' | 'CONFLICT';
export type ElectricalState =
  | { status: 'uninitialized' }
  | { status: 'resolved'; voltage: number; logic: LogicLevel }
  | { status: 'error'; code: 'short-circuit' | 'overvoltage' | 'incompatible-drivers' };
export interface GpioState {
  mode: 'input' | 'input-pullup' | 'output';
  level: LogicLevel;
  /** Transient timer output; never part of a saved component or program. */
  pwm?: { value: number; periodUs: number };
}
export interface PinDefinition {
  id: string;
  label: string;
  position: Point;
  electricalType: ElectricalPinType;
  gpio?: number;
  maxVoltage?: number;
  bootLevel?: 'HIGH' | 'LOW';
}
export type VirtualHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export interface VirtualRoute {
  method: VirtualHttpMethod;
  path: string;
  status: number;
  responseBody: string;
  gpio?: { pinId: string; level: 'HIGH' | 'LOW' };
}
export interface VirtualNetworkConfig {
  ssid: string;
  routes: VirtualRoute[];
}
export interface LeadAttachment {
  pinId: string;
  breadboardId: string;
  holeId: string;
}
interface ComponentBase {
  id: string;
  position: Point;
  rotation: number;
  /** Optional v1 extension. Legacy documents have no inserted leads. */
  attachments?: LeadAttachment[];
}
export type ElectronicComponent = ComponentBase &
  (
    | { kind: 'arduino-uno'; properties: { logicVoltage: 5 } }
    | { kind: 'esp8266'; properties: { logicVoltage: 3.3; virtualNetwork?: VirtualNetworkConfig } }
    | { kind: 'breadboard'; properties: { columns: 63 } }
    | { kind: 'led'; properties: { color: 'red' | 'green' | 'blue' | 'yellow' } }
    | { kind: 'resistor'; properties: { resistance: number } }
    | { kind: 'pushbutton'; properties: { normallyClosed: boolean } }
    | { kind: 'potentiometer'; properties: { resistance: number; ratio: number } }
    | { kind: 'pcf8574'; properties: { address: number; contrast: number } }
    | { kind: 'lcd-16x2' | 'lcd-20x4'; properties: { controller: 'HD44780' } }
    | { kind: 'dht11'; properties: { temperature: number; humidity: number } }
    | { kind: 'dc-motor'; properties: { resistance: number; nominalVoltage: number; maxCurrent: number } }
    | { kind: 'l293d'; properties: { model: 'L293D' } }
    | { kind: 'battery-9v'; properties: { voltage: number; internalResistance?: number; maxCurrent: number } }
    | { kind: 'power-supply'; properties: { voltage: number } }
  );
export interface PinReference {
  componentId: string;
  pinId: string;
}
export interface Wire {
  id: string;
  from: PinReference;
  to: PinReference;
  color: string;
  waypoints: Point[];
}
export interface SourceFile { name: string; source: string }
export interface BoardProgram {
  /** Optional v1 extension; legacy source becomes main.ino on the first file edit. */
  files?: SourceFile[];
  activeFile?: string | null;
  componentId: string;
  language: 'arduino-cpp';
  source: string;
  execution: 'unavailable';
}
export interface CircuitProject {
  format: 'mesa-circuit';
  version: 1;
  id: string;
  name: string;
  components: ElectronicComponent[];
  wires: Wire[];
  programs: BoardProgram[];
  viewport: Viewport;
}
export type WorkspaceTool = 'select' | 'pan' | 'connect';
export type WorkspaceEvent =
  | { type: 'viewport-changed'; viewport: Viewport }
  | { type: 'selection-changed'; componentId: string | null };
