import type { CircuitProject } from '../model/types';
import { L293D_CHANNELS } from '../model/l293d';
import { evaluateDc } from './dc';
import type { DcResult } from './dc';
import type { Branch } from './models';
import { pinKey } from './topology';
import type { ElectricalTopology } from './topology';
import type { BridgeChannelState, SimulationIssue } from './types';

/** Resistive equivalent of typical 1.4 V source / 1.2 V sink drops at 0.6 A.
 * This approximation has no fixed saturation knee or transient behavior. */
export const L293D_HIGH_OHMS = 1.4 / 0.6;
export const L293D_LOW_OHMS = 1.2 / 0.6;
export const L293D_CURRENT_LIMIT = 0.6;

export function relativeVoltage(dc: DcResult, a: string | undefined, b: string | undefined): number | undefined {
  if (a === undefined || b === undefined) return undefined;
  const va = dc.voltages.get(a), vb = dc.voltages.get(b);
  return va !== undefined && vb !== undefined && dc.references.get(a) === dc.references.get(b) ? va - vb : undefined;
}

/** Bounded DC/control fixed point. No editable circuit copy, hidden GPIO link,
 * motor voltage source, clock, mechanical state or UI dependency. */
export function solveMotorDrivers(project: CircuitProject, topology: ElectricalTopology, base: readonly Branch[]) {
  const drivers = project.components.filter((part) => part.kind === 'l293d');
  const diagnostics: SimulationIssue[] = [];
  const failedSupply = new Set<string>();
  let dc = evaluateDc(base);
  let branches = [...base];
  let bridge = new Map<string, BridgeChannelState[]>();
  let previous = '';
  const warn = (code: SimulationIssue['code'], componentId: string, pinIds: string[]) => {
    if (!diagnostics.some((issue) => issue.code === code && issue.componentIds[0] === componentId && issue.pinIds.join() === pinIds.join()))
      diagnostics.push({ code, severity: 'warning', componentIds: [componentId], pinIds });
  };
  for (let pass = 0; pass < 8; pass++) {
    const outputs: Branch[] = [];
    bridge = new Map();
    for (const driver of drivers) {
      const node = (id: string) => topology.nodeByPin.get(pinKey(driver.id, id));
      const voltage = (id: string) => relativeVoltage(dc, node(id), node('GND'));
      const logicSupply = voltage('VCC1'), motorSupply = voltage('VCC2');
      if ((logicSupply !== undefined && logicSupply < -1e-8) || (motorSupply !== undefined && motorSupply < -1e-8))
        warn('reverse-polarity', driver.id, ['VCC1', 'VCC2', 'GND']);
      const supplied = logicSupply !== undefined && motorSupply !== undefined &&
        logicSupply >= 4.5 - 1e-8 && logicSupply <= 7 + 1e-8 &&
        motorSupply >= logicSupply - 1e-8 && motorSupply <= 36 + 1e-8;
      if (!supplied) { failedSupply.add(driver.id); warn('driver-supply', driver.id, ['VCC1', 'VCC2', 'GND']); }
      const states: BridgeChannelState[] = [];
      for (const channel of L293D_CHANNELS) {
        if (failedSupply.has(driver.id)) { states.push('invalid'); continue; }
        const logic = (id: string): boolean | undefined => {
          const value = voltage(id);
          if (value === undefined || value < -0.3 || value > Math.min(7, logicSupply ?? 0) + 1e-8) return undefined;
          return value <= 1.5 ? false : value >= 2.3 ? true : undefined;
        };
        const enabled = logic(channel.enable);
        if (enabled === false) { states.push('disabled'); continue; }
        const levels = channel.inputs.map(logic);
        if (enabled === undefined || levels.some((level) => level === undefined)) {
          states.push('invalid'); continue;
        }
        states.push(levels[0] === levels[1] ? 'brake' : levels[0] ? 'forward' : 'reverse');
        channel.outputs.forEach((output, index) => {
          const high = levels[index] === true;
          const a = node(output), b = node(high ? 'VCC2' : 'GND');
          if (a !== undefined && b !== undefined) outputs.push({ id: `${driver.id}:drive:${output}`, componentId: driver.id,
            kind: 'resistor', a, b, value: high ? L293D_HIGH_OHMS : L293D_LOW_OHMS });
        });
      }
      bridge.set(driver.id, states);
    }
    outputs.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const signature = JSON.stringify([outputs, [...bridge]]);
    if (signature === previous) {
      for (const [id, states] of bridge) states.forEach((state, index) => {
        const channel = L293D_CHANNELS[index];
        if (state === 'invalid' && channel && !failedSupply.has(id)) warn('driver-input', id, [channel.enable, ...channel.inputs]);
      });
      return { branches, dc, diagnostics, bridge };
    }
    previous = signature;
    branches = [...base, ...outputs];
    dc = evaluateDc(branches);
  }
  // Feedback circuits that do not settle are unsupported; never retain an
  // arbitrary intermediate energized output or report its invented reading.
  diagnostics.push({ code: 'unsupported-network', severity: 'warning', componentIds: drivers.map((part) => part.id), pinIds: [] });
  return { branches: [...base], dc: evaluateDc(base), diagnostics,
    bridge: new Map(drivers.map((part) => [part.id, ['invalid', 'invalid'] satisfies BridgeChannelState[]])) };
}
