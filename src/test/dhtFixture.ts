import { createComponent } from '../model/components';
import { createProject } from '../model/project';
import type { CircuitProject } from '../model/types';
export function dhtFixture(): CircuitProject {
  const wire = (id: string, a: string, pa: string, b: string, pb: string) => ({ id, from: { componentId: a, pinId: pa }, to: { componentId: b, pinId: pb }, color: '#668c75', waypoints: [] });
  return { ...createProject('dht-fixture'), components: [createComponent('arduino-uno', { x: 50, y: 60 }, 'uno'),
    createComponent('dht11', { x: 400, y: 180 }, 'sensor')],
    wires: [wire('vcc', 'uno', '5V', 'sensor', 'VCC'), wire('ground', 'uno', 'GND', 'sensor', 'GND'),
      wire('data', 'uno', 'D2', 'sensor', 'DATA')], programs: [] };
}
