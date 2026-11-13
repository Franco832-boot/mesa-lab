import source from '../../examples/arduino/motor-l293d-millis.ino?raw';
import { createComponent } from './components';
import { mountExampleComponent } from './examplePlacement';
import { createProject, parseProject } from './project';
import type { CircuitProject, ElectronicComponent, Wire } from './types';

/** A normal project, solved only through its registered contacts and wires. */
export function createMotorExample(name: string, projectId: string): CircuitProject {
  const components: ElectronicComponent[] = [
    createComponent('arduino-uno', { x: 50, y: 40 }, 'uno'),
    createComponent('breadboard', { x: 50, y: 365 }, 'breadboard'),
    createComponent('dc-motor', { x: 440, y: 100 }, 'motor'),
    createComponent('battery-9v', { x: 620, y: 80 }, 'battery'),
  ];
  components.push(mountExampleComponent(components, 'l293d', 'bridge', 'f25'));
  const wire = (id: string, a: string, pa: string, b: string, pb: string, color = '#668c75'): Wire => ({
    id, from: { componentId: a, pinId: pa }, to: { componentId: b, pinId: pb }, color, waypoints: [],
  });
  // DIP pin 1 is f25; pin 8 f32; pin 9 e32; pin 16 e25.
  // Wires land on other holes in those actual contact strips, never on
  // overlapping artwork. All four GND leads have visible return connections.
  const wires = [
    wire('logic-power', 'uno', '5V', 'breadboard', 'a25', '#bd665c'),
    wire('logic-ground', 'uno', 'GND', 'breadboard', 'bn1', '#525b69'),
    wire('motor-power', 'battery', 'positive', 'breadboard', 'j32', '#bd665c'),
    wire('motor-ground', 'battery', 'negative', 'breadboard', 'bn40', '#525b69'),
    ...['j28', 'j29', 'a28', 'a29'].map((hole, index) => wire(`dip-ground-${index}`, 'breadboard', hole, 'breadboard', `bn${20 + index}`, '#525b69')),
    wire('enable', 'uno', 'D8', 'breadboard', 'j25'),
    wire('in1', 'uno', 'D9', 'breadboard', 'j26'),
    wire('in2', 'uno', 'D10', 'breadboard', 'j31'),
    wire('out1', 'breadboard', 'j27', 'motor', 'positive', '#c69242'),
    wire('out2', 'breadboard', 'j30', 'motor', 'negative', '#7d85a7'),
    wire('unused-enable', 'breadboard', 'a32', 'breadboard', 'bn30', '#525b69'),
    wire('unused-in3', 'breadboard', 'a31', 'breadboard', 'bn31', '#525b69'),
    wire('unused-in4', 'breadboard', 'a26', 'breadboard', 'bn32', '#525b69'),
  ];
  return parseProject(JSON.stringify({ ...createProject(projectId), name, components, wires,
    programs: [{ componentId: 'uno', language: 'arduino-cpp', execution: 'unavailable', source }] }));
}
