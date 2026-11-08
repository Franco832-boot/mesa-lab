import { componentDefinitions } from '../model/components';
import type { BoardKind, CircuitProject, ElectronicComponent, GpioState, PinDefinition } from '../model/types';
import type { DcResult } from './dc';
import type { Branch } from './models';
import { ownInput, pinKey } from './topology';
import type { ElectricalTopology } from './topology';
import type { PinResult, SimulationInputs, SimulationIssue } from './types';

/** Illustrative Thevenin output resistance, not a datasheet transistor model. */
export const GPIO_DRIVE_OHMS: Readonly<Record<BoardKind, number>> = { 'arduino-uno': 40, esp8266: 50 };
export const GPIO_CURRENT_LIMIT_A: Readonly<Record<BoardKind, number>> = { 'arduino-uno': 0.02, esp8266: 0.012 };
export const GPIO_PULLUP_OHMS = 30000;
/** Canonical controls; aliases in the physical registry share their GPIO configuration. */
export function gpioPins(kind: BoardKind): readonly PinDefinition[] {
  return componentDefinitions[kind].pins.filter((pin) => pin.gpio !== undefined && !['SCL', 'SDA'].includes(pin.id) && !pin.id.startsWith('ICSP-')).sort((a, b) => (a.gpio ?? 0) - (b.gpio ?? 0));
}
export function gpioConfiguration(component: ElectronicComponent, pin: PinDefinition, inputs: SimulationInputs): GpioState {
  for (const alias of componentDefinitions[component.kind].pins) {
    if (alias.gpio === pin.gpio) {
      const configured = ownInput(inputs.gpio, pinKey(component.id, alias.id));
      if (configured) return configured;
    }
  }
  return { mode: 'input', level: 'FLOATING' };
}
export const driverBranchId = (componentId: string, pinId: string) => pinKey(componentId, `@output:${pinId}`);
export function boardModels(component: ElectronicComponent, topology: ElectricalTopology, inputs: SimulationInputs): Branch[] {
  if (component.kind !== 'arduino-uno' && component.kind !== 'esp8266') return [];
  const kind = component.kind;
  const node = (pin: string) => {
    const resolved = topology.nodeByPin.get(pinKey(component.id, pin));
    if (resolved === undefined) throw new Error('board-pin-missing');
    return resolved;
  };
  const ground = node('GND');
  const branches: Branch[] = [];
  const supply = (pin: string, voltage: number) => branches.push({ id: pinKey(component.id, `@supply:${pin}`), componentId: component.id, a: node(pin), b: ground, kind: 'source', value: voltage });
  // Boards have an explicit simulated USB supply. VIN is not a voltage source.
  if (kind === 'arduino-uno') supply('5V', 5);
  supply('3V3', 3.3);
  for (const pin of gpioPins(kind)) {
    const state = gpioConfiguration(component, pin, inputs);
    if (state.mode === 'input-pullup') {
      branches.push({ id: driverBranchId(component.id, pin.id), componentId: component.id, a: node(pin.id), b: node(kind === 'arduino-uno' ? '5V' : '3V3'), kind: 'resistor', value: GPIO_PULLUP_OHMS });
    } else if (state.mode === 'output' && state.level !== 'FLOATING') {
      const internal = pinKey(component.id, `@drive:${pin.id}`);
      branches.push({ id: pinKey(component.id, `@drive-source:${pin.id}`), componentId: component.id, a: internal, b: ground, kind: 'source', value: state.level === 'HIGH' ? component.properties.logicVoltage : 0 });
      branches.push({ id: driverBranchId(component.id, pin.id), componentId: component.id, a: internal, b: node(pin.id), kind: 'resistor', value: GPIO_DRIVE_OHMS[kind] });
    }
  }
  return branches;
}
export function evaluateGpio(project: CircuitProject, topology: ElectricalTopology, dc: DcResult): { pins: Map<string, PinResult>; diagnostics: SimulationIssue[] } {
  const pins = new Map<string, PinResult>();
  const diagnostics: SimulationIssue[] = [];
  for (const component of project.components) {
    if (component.kind !== 'arduino-uno' && component.kind !== 'esp8266') continue;
    const ground = topology.nodeByPin.get(pinKey(component.id, 'GND'));
    const groundVoltage = ground === undefined ? undefined : dc.voltages.get(ground);
    let totalDriveCurrent = 0;
    for (const pin of componentDefinitions[component.kind].pins) {
      const key = pinKey(component.id, pin.id);
      const node = topology.nodeByPin.get(key);
      const absolute = node === undefined ? undefined : dc.voltages.get(node);
      const referenced = node !== undefined && ground !== undefined && dc.references.get(node) !== undefined && dc.references.get(node) === dc.references.get(ground);
      const voltage = absolute !== undefined && groundVoltage !== undefined && referenced ? absolute - groundVoltage : undefined;
      if (pin.gpio !== undefined) {
        const nominal = component.properties.logicVoltage;
        const low = component.kind === 'esp8266' ? 0.25 : 0.3;
        const high = component.kind === 'esp8266' ? 0.75 : 0.6;
        const logic: PinResult['logic'] = voltage === undefined ? 'FLOATING' : voltage <= nominal * low ? 'LOW' : voltage >= nominal * high ? 'HIGH' : 'UNDEFINED';
        pins.set(key, voltage === undefined ? { logic } : { voltage, logic });
        if (voltage === undefined && topology.connectedPins.has(key)) diagnostics.push({ code: 'floating-node', severity: 'warning', componentIds: [component.id], pinIds: [pin.id] });
        if (voltage !== undefined && (voltage > nominal + 0.3 || voltage < -0.3)) diagnostics.push({ code: 'gpio-overvoltage', severity: 'warning', componentIds: [component.id], pinIds: [pin.id] });
        if (pin.bootLevel && voltage !== undefined && (logic === 'HIGH' || logic === 'LOW') && logic !== pin.bootLevel) diagnostics.push({ code: 'boot-sensitive-pin', severity: 'warning', componentIds: [component.id], pinIds: [pin.id] });
      } else if (topology.connectedPins.has(key) && pin.electricalType !== 'ground' && !['5V', 'ICSP-5V', 'IOREF', '3V3', '3V3-2', '3V3-3'].includes(pin.id)) {
        diagnostics.push({ code: 'unsupported-pin', severity: 'warning', componentIds: [component.id], pinIds: [pin.id] });
      }
    }
    for (const pin of gpioPins(component.kind)) {
      const current = dc.currents.get(driverBranchId(component.id, pin.id));
      if (current !== undefined) {
        totalDriveCurrent += Math.abs(current);
        if (Math.abs(current) > GPIO_CURRENT_LIMIT_A[component.kind] + 1e-10) diagnostics.push({ code: 'gpio-overcurrent', severity: 'warning', componentIds: [component.id], pinIds: [pin.id] });
      }
    }
    // UNO ATmega package absolute maximum; no promise of safe aggregate port loading.
    if (component.kind === 'arduino-uno' && totalDriveCurrent > 0.2 + 1e-10) diagnostics.push({ code: 'gpio-overcurrent', severity: 'warning', componentIds: [component.id], pinIds: [] });
    if (component.kind === 'arduino-uno') {
      const current = dc.currents.get(pinKey(component.id, '@supply:3V3'));
      if (current !== undefined && Math.abs(current) > 0.05 + 1e-10) diagnostics.push({ code: 'gpio-overcurrent', severity: 'warning', componentIds: [component.id], pinIds: ['3V3'] });
    }
  }
  return { pins, diagnostics };
}
