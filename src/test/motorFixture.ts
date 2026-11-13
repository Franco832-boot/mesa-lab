import { createComponent } from '../model/components';
import { createProject } from '../model/project';
import type { CircuitProject, Wire } from '../model/types';
import { pinKey } from '../sim/topology';
import type { SimulationInputs } from '../sim/types';

export function motorWire(id: string, fromId: string, fromPin: string, toId: string, toPin: string): Wire {
  return { id, from: { componentId: fromId, pinId: fromPin }, to: { componentId: toId, pinId: toPin }, color: '#668c75', waypoints: [] };
}
export function motorFixture(): CircuitProject {
  return { ...createProject('motor-fixture'), components: [
    createComponent('arduino-uno', { x: 0, y: 0 }, 'uno'),
    createComponent('l293d', { x: 350, y: 300 }, 'bridge'),
    createComponent('dc-motor', { x: 600, y: 200 }, 'motor'),
    createComponent('battery-9v', { x: 650, y: 400 }, 'battery'),
  ], wires: [
    motorWire('logic-power', 'uno', '5V', 'bridge', 'VCC1'),
    motorWire('logic-ground', 'uno', 'GND', 'bridge', 'GND'),
    motorWire('motor-power', 'battery', 'positive', 'bridge', 'VCC2'),
    motorWire('motor-ground', 'battery', 'negative', 'bridge', 'GND-2'),
    motorWire('enable', 'uno', 'D8', 'bridge', 'EN1,2'),
    motorWire('in1', 'uno', 'D9', 'bridge', 'IN1'),
    motorWire('in2', 'uno', 'D10', 'bridge', 'IN2'),
    motorWire('out1', 'bridge', 'OUT1', 'motor', 'positive'),
    motorWire('out2', 'bridge', 'OUT2', 'motor', 'negative'),
    motorWire('unused-enable', 'bridge', 'EN3,4', 'bridge', 'GND'),
    motorWire('unused-in3', 'bridge', 'IN3', 'bridge', 'GND'),
    motorWire('unused-in4', 'bridge', 'IN4', 'bridge', 'GND'),
  ] };
}
export function motorInputs(enabled = true, first = true, second = false): SimulationInputs {
  return { gpio: Object.fromEntries([['D8', enabled], ['D9', first], ['D10', second]].map(([id, high]) => [
    pinKey('uno', String(id)), { mode: 'output', level: high ? 'HIGH' : 'LOW' },
  ])) };
}
