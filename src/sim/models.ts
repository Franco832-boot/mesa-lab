import type { CircuitProject } from '../model/types';
import { potentiometerResistances } from '../model/potentiometer';
import { DHT11_PULLUP_OHMS } from '../model/dht11';
import type { ElectricalTopology } from './topology';
import { boardModels } from './gpio';
import { ownInput, pinKey } from './topology';
import type { SimulationInputs, SimulationIssue } from './types';

export interface Branch {
  id: string;
  componentId: string;
  a: string;
  b: string;
  kind: 'resistor' | 'source' | 'led';
  value: number;
}
export const ledForwardVoltage = { red: 2, yellow: 2.1, green: 2.2, blue: 3.1 } as const;
export interface CircuitModels {
  branches: Branch[];
  diagnostics: SimulationIssue[];
}
export function buildModels(
  project: CircuitProject,
  topology: ElectricalTopology,
  inputs: SimulationInputs,
): CircuitModels {
  const branches: Branch[] = [];
  const diagnostics: SimulationIssue[] = [];
  for (const component of project.components) {
    const node = (id: string): string => {
      const resolved = topology.nodeByPin.get(pinKey(component.id, id));
      if (!resolved) throw new Error('model-pin-missing');
      return resolved;
    };
    const add = (kind: Branch['kind'], a: string, b: string, value: number) => {
      branches.push({ id: `${component.id}:${kind}`, componentId: component.id, kind, a: node(a), b: node(b), value });
    };
    switch (component.kind) {
      case 'pcf8574': {
        add('resistor', 'VCC', 'GND', 50000);
        for (const terminal of ['SDA', 'SCL']) branches.push({ id: `${component.id}:pullup:${terminal}`, componentId: component.id, kind: 'resistor', a: node('VCC'), b: node(terminal), value: 4700 });
        const ratio = component.properties.contrast;
        // End stops retain a finite 1 ohm contact, avoiding zero resistance stamps.
        branches.push({ id: `${component.id}:contrast:top`, componentId: component.id, kind: 'resistor', a: node('VCC'), b: node('LCD_VO'), value: Math.max(1, ratio * 10000) },
          { id: `${component.id}:contrast:bottom`, componentId: component.id, kind: 'resistor', a: node('LCD_VO'), b: node('GND'), value: Math.max(1, (1 - ratio) * 10000) });
        const latch = ownInput(inputs.pcf8574, component.id) ?? 0;
        for (const [bit, terminal] of ['RS','RW','E','A','D4','D5','D6','D7'].entries()) {
          if (bit === 3) continue;
          const high = (latch & (1 << bit)) !== 0;
          branches.push({ id: `${component.id}:port:${bit}`, componentId: component.id, kind: 'resistor', a: node(`LCD_${terminal}`), b: node(high ? 'VCC' : 'GND'), value: high ? 10000 : 100 });
        }
        if ((latch & 8) !== 0) branches.push({ id: `${component.id}:backlight`, componentId: component.id, kind: 'resistor', a: node('VCC'), b: node('LCD_A'), value: 220 });
        break;
      }
      // Illustrative standby load: 100 µA at 5 V. Protocol pulses are API-modeled.
      case 'lcd-20x4': case 'lcd-16x2':
        add('resistor', 'VDD', 'VSS', 5000);
        branches.push({ id: `${component.id}:backlight`, componentId: component.id, kind: 'led', a: node('A'), b: node('K'), value: 3 });
        break;
      case 'dht11':
        add('resistor', 'VCC', 'GND', 50000);
        branches.push({ id: `${component.id}:resistor:pullup`, componentId: component.id,
          kind: 'resistor', a: node('VCC'), b: node('DATA'), value: DHT11_PULLUP_OHMS });
        break;
      case 'power-supply': add('source', 'positive', 'negative', component.properties.voltage); break;
      case 'resistor': add('resistor', '1', '2', component.properties.resistance); break;
      case 'led': add('led', 'anode', 'cathode', ledForwardVoltage[component.properties.color]); break;
      case 'breadboard': break;
      case 'pushbutton': break;
      case 'potentiometer': {
        const ratio = ownInput(inputs.potentiometers, component.id) ?? component.properties.ratio;
        const segments = potentiometerResistances(component.properties.resistance, ratio);
        if (ratio > 0) branches.push({ id: pinKey(component.id, '@pot:1'), componentId: component.id, kind: 'resistor', a: node('1'), b: node('wiper'), value: segments.toTerminal1 });
        if (ratio < 1) branches.push({ id: pinKey(component.id, '@pot:3'), componentId: component.id, kind: 'resistor', a: node('wiper'), b: node('3'), value: segments.toTerminal3 });
        break;
      }
      case 'arduino-uno':
      case 'esp8266': branches.push(...boardModels(component, topology, inputs)); break;
    }
  }
  // Stable source ordering also makes the chosen island reference independent
  // of document array order.
  branches.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return { branches, diagnostics };
}
