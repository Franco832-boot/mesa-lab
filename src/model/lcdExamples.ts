import lcd16Parallel from '../../examples/arduino/lcd16-parallel.ino?raw';
import lcd20Parallel from '../../examples/arduino/lcd20-parallel.ino?raw';
import lcd16I2c from '../../examples/arduino/lcd16-i2c.ino?raw';
import lcd20I2c from '../../examples/arduino/lcd20-i2c.ino?raw';
import { createComponent } from './components';
import { createProject, parseProject } from './project';
import { mountExampleComponent } from './examplePlacement';
import { LCD_TERMINALS } from './lcd';
import type { CircuitProject, ElectronicComponent, Wire } from './types';

export type LcdExampleId = 'lcd16-parallel' | 'lcd20-parallel' | 'lcd16-i2c' | 'lcd20-i2c';
const sources: Readonly<Record<LcdExampleId, string>> = { 'lcd16-parallel': lcd16Parallel, 'lcd20-parallel': lcd20Parallel, 'lcd16-i2c': lcd16I2c, 'lcd20-i2c': lcd20I2c };
const parallelSignals = [['RS','D12'],['E','D11'],['D4','D5'],['D5','D4'],['D6','D3'],['D7','D2']] as const;
export function createLcdExample(id: LcdExampleId, name: string, projectId: string): CircuitProject {
  const kind = id.startsWith('lcd20') ? 'lcd-20x4' : 'lcd-16x2';
  const components: ElectronicComponent[] = [createComponent('arduino-uno', { x: 50, y: 30 }, 'uno'),
    createComponent('breadboard', { x: 50, y: 390 }, 'breadboard'), createComponent(kind, { x: 375, y: 60 }, 'lcd')];
  const wire = (key: string, a: string, pa: string, b: string, pb: string, color = '#668c75'): Wire => ({ id: key, from: { componentId: a, pinId: pa }, to: { componentId: b, pinId: pb }, color, waypoints: [] });
  const wires = [wire('power', 'uno','5V','breadboard','a1','#bd665c'), wire('ground','uno','GND','breadboard','a2','#525b69')];
  if (id.endsWith('i2c')) {
    components.push(createComponent('pcf8574', { x: 400, y: 315 }, 'adapter'));
    wires.push(wire('adapter-power','breadboard','b1','adapter','VCC','#bd665c'), wire('adapter-ground','breadboard','b2','adapter','GND','#525b69'),
      wire('sda','uno','A4','adapter','SDA'), wire('scl','uno','A5','adapter','SCL'),
      ...LCD_TERMINALS.map((pin) => wire(`pad-${pin}`,'adapter',`LCD_${pin}`,'lcd',pin)));
  } else {
    const pot = mountExampleComponent(components, 'potentiometer', 'contrast', 'b10');
    if (pot.kind !== 'potentiometer') throw new Error('invalid-example-potentiometer');
    components.push({ ...pot, properties: { resistance: 10000, ratio: .9 } });
    const resistor = mountExampleComponent(components, 'resistor', 'backlight-r', 'b20');
    if (resistor.kind !== 'resistor') throw new Error('invalid-example-resistor');
    components.push({ ...resistor, properties: { resistance: 220 } });
    wires.push(wire('lcd-power','breadboard','b1','lcd','VDD','#bd665c'), wire('lcd-ground','breadboard','b2','lcd','VSS','#525b69'),
      wire('rw','breadboard','c2','lcd','RW','#525b69'), wire('bk','breadboard','d2','lcd','K','#525b69'),
      wire('contrast-high','breadboard','c1','breadboard','a10'), wire('contrast-low','breadboard','e2','breadboard','a12'), wire('contrast-wiper','breadboard','a11','lcd','VO'),
      wire('backlight-supply','breadboard','d1','breadboard','a20','#bd665c'), wire('backlight-anode','breadboard','a24','lcd','A','#bd665c'),
      ...parallelSignals.map(([terminal, pin], index) => wire(`signal-${index}`,'uno',pin, 'lcd', terminal)));
  }
  return parseProject(JSON.stringify({ ...createProject(projectId), name, components, wires,
    programs: [{ componentId: 'uno', language: 'arduino-cpp', execution: 'unavailable', source: sources[id] }] }));
}
