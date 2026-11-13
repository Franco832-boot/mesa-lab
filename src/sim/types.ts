import type { LcdController, LcdView } from '../model/lcd';
import type { BoardKind, CircuitProject, GpioState, LogicLevel } from '../model/types';
import type { DhtEnvironment } from '../model/dht11';

export type ComponentCondition = 'normal' | 'active' | 'warning' | 'overheated' | 'damaged';
export type DiagnosticCode =
  | 'invalid-reference'
  | 'invalid-input'
  | 'disconnected-component'
  | 'open-circuit'
  | 'floating-node'
  | 'short-circuit'
  | 'contradictory-sources'
  | 'unsupported-network'
  | 'reverse-polarity'
  | 'driver-supply'
  | 'driver-input'
  | 'driver-overcurrent'
  | 'motor-overload'
  | 'battery-overcurrent'
  | 'battery-sag'
  | 'led-overcurrent'
  | 'resistor-overpower'
  | 'gpio-overcurrent'
  | 'gpio-overvoltage'
  | 'boot-sensitive-pin'
  | 'unsupported-pin';
export interface SimulationIssue {
  code: DiagnosticCode;
  severity: 'info' | 'warning' | 'error';
  componentIds: string[];
  pinIds: string[];
}
export interface SimulationInputs {
  pcf8574?: Readonly<Record<string, number>>;
  lcd?: Readonly<Record<string, LcdController>>;
  dht11?: Readonly<Record<string, DhtEnvironment>>;
  gpio?: Readonly<Record<string, GpioState>>;
  /** Physical pressed state, independent of normallyClosed project configuration. */
  buttons?: Readonly<Record<string, boolean>>;
  potentiometers?: Readonly<Record<string, number>>;
}
export interface PinResult {
  voltage?: number;
  logic: LogicLevel | 'UNDEFINED';
}
export interface ComponentResult {
  motor?: { direction: 'forward' | 'reverse' | 'stopped' | 'unresolved'; speed?: number; drivenFraction?: number };
  peakCurrent?: number;
  bridge?: readonly BridgeChannelState[];
  lcd?: LcdView;
  condition: ComponentCondition;
  current?: number;
  voltage?: number;
  power?: number;
  brightness?: number;
}
export type BridgeChannelState = 'forward' | 'reverse' | 'brake' | 'disabled' | 'invalid';
export interface ElectricalSnapshot {
  /** Actual elapsed electrical intervals, including intermediate GPIO events. */
  interval?: { durationUs: number; components: Readonly<Record<string, ComponentInterval>> };
  pins: Readonly<Record<string, PinResult>>;
  components: Readonly<Record<string, ComponentResult>>;
  diagnostics: readonly SimulationIssue[];
}
export interface ComponentInterval {
  meanVoltage?: number;
  meanCurrent?: number;
  meanPower?: number;
  peakCurrent?: number;
  /** Integral of absolute current over resolved intervals only (A·s). */
  resolvedCharge: number;
  resolvedCurrentUs: number;
}
/** Stateless DC interface: Phase 4 controllers supply inputs, never mutate the document. */
export interface ElectricalEngine {
  evaluate(project: CircuitProject, inputs?: SimulationInputs): ElectricalSnapshot;
}
/** Reserved binary-emulation contract; source execution uses firmware/uno.ts. */
export interface FirmwareRuntime {
  readonly board: BoardKind;
  load(binary: Uint8Array): void;
  step(cycles: number): ReadonlyMap<string, GpioState>;
  reset(): void;
}
