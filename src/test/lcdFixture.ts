import { createComponent } from '../model/components';
import { createProject } from '../model/project';
import type { CircuitProject, Wire } from '../model/types';
import { LCD_TERMINALS } from '../model/lcd';
export function poweredLcd(): CircuitProject {
  const wire = (id: string, pin: string, terminal: string): Wire => ({ id, from: { componentId: 'uno', pinId: pin }, to: { componentId: 'lcd', pinId: terminal }, color: '#668c75', waypoints: [] });
  return { ...createProject('lcd-test'), components: [createComponent('arduino-uno', { x: 0, y: 0 }, 'uno'), createComponent('lcd-16x2', { x: 400, y: 0 }, 'lcd')],
    wires: [wire('supply', '5V', 'VDD'), wire('ground', 'GND', 'VSS'), wire('contrast', 'GND', 'VO'), wire('rw', 'GND', 'RW')] };
}

export function parallelLcdFixture(): CircuitProject {
  const project = poweredLcd();
  const connections = [['RS','D12'],['E','D11'],['D4','D5'],['D5','D4'],['D6','D3'],['D7','D2']] as const;
  project.wires.push(...connections.map(([terminal, pin]) => ({ id: terminal, from: { componentId: 'uno', pinId: pin },
    to: { componentId: 'lcd', pinId: terminal }, color: '#668c75', waypoints: [] })));
  return project;
}
export function i2cLcdFixture(): CircuitProject {
  const project = poweredLcd();
  project.components.push(createComponent('pcf8574', { x: 400, y: 200 }, 'adapter'));
  const wire = (id: string, a: string, pa: string, b: string, pb: string): Wire => ({ id, from: { componentId: a, pinId: pa }, to: { componentId: b, pinId: pb }, color: '#668c75', waypoints: [] });
  project.wires = [wire('vcc','uno','5V','adapter','VCC'), wire('ground','uno','GND','adapter','GND'),
    wire('sda','uno','A4','adapter','SDA'), wire('scl','uno','A5','adapter','SCL'),
    ...LCD_TERMINALS.map((pin) => wire(`pad-${pin}`, 'adapter', `LCD_${pin}`, 'lcd', pin))];
  return project;
}
