import dhtSource from '../../examples/arduino/dht11-project.ino?raw';
import millisSource from '../../examples/arduino/blink-without-delay.ino?raw';
import forSource from '../../examples/arduino/led-for.ino?raw';
import type { TranslationKey } from '../locales/es/messages';
import { componentDefinitions, createComponent, newId, pinWorldPosition } from './components';
import { planInsertion } from './breadboard';
import { createProject, parseProject } from './project';
import type { CircuitProject, ComponentKind, ElectronicComponent, Wire } from './types';

export type ExampleCategory = 'basics' | 'sensors' | 'displays' | 'communication';
export type ExampleId = 'dht11' | 'led-millis' | 'led-for';
export interface ProjectExample {
  readonly id: ExampleId;
  readonly name: TranslationKey;
  readonly description: TranslationKey;
  readonly category: ExampleCategory;
  readonly components: readonly ComponentKind[];
}
export const exampleCategoryLabels: Readonly<Record<ExampleCategory, TranslationKey>> = {
  basics: 'exampleCategoryBasics', sensors: 'exampleCategorySensors',
  displays: 'exampleCategoryDisplays', communication: 'exampleCategoryCommunication',
};
export const projectExamples = [
  { id: 'dht11', name: 'exampleDhtName', description: 'exampleDhtDescription', category: 'sensors', components: ['arduino-uno', 'breadboard', 'dht11'] },
  { id: 'led-millis', name: 'exampleMillisName', description: 'exampleMillisDescription', category: 'basics', components: ['arduino-uno', 'breadboard', 'led', 'resistor'] },
  { id: 'led-for', name: 'exampleForName', description: 'exampleForDescription', category: 'basics', components: ['arduino-uno', 'breadboard', 'led', 'resistor'] },
] as const satisfies readonly ProjectExample[];
export const availableExampleCategories: readonly ExampleCategory[] = [...new Set(projectExamples.map((item) => item.category))];

const sketches: Readonly<Record<ExampleId, string>> = { dht11: dhtSource, 'led-millis': millisSource, 'led-for': forSource };
function mount(components: readonly ElectronicComponent[], kind: 'dht11' | 'led' | 'resistor', id: string, holeId: string): ElectronicComponent {
  const part = createComponent(kind, { x: 0, y: 0 }, id);
  const lead = componentDefinitions[kind].pins[0];
  const target = pinWorldPosition(components, { componentId: 'breadboard', pinId: holeId });
  if (!lead || !target) throw new Error('invalid-example-contact');
  const plan = planInsertion(components, { ...part, position: { x: target.x - lead.position.x, y: target.y - lead.position.y } });
  if (!plan.valid || !plan.component.attachments?.length) throw new Error('invalid-example-footprint');
  return plan.component;
}
function wire(id: string, pinId: string, holeId: string, color: string): Wire {
  return { id, from: { componentId: 'uno', pinId }, to: { componentId: 'breadboard', pinId: holeId }, color, waypoints: [] };
}
/** Each call creates a fresh, validated ordinary v1 project. Footprints and
 * dimensions come exclusively from the shared physical registry. */
export function createExampleProject(id: ExampleId, name: string, projectId = newId()): CircuitProject {
  const components: ElectronicComponent[] = [
    createComponent('arduino-uno', { x: 80, y: 60 }, 'uno'),
    createComponent('breadboard', { x: 50, y: 350 }, 'breadboard'),
  ];
  let wires: Wire[];
  if (id === 'dht11') {
    components.push(mount(components, 'dht11', 'sensor', 'b25'));
    wires = [wire('sensor-vcc', '5V', 'a26', '#bd665c'), wire('sensor-ground', 'GND', 'a27', '#525b69'), wire('sensor-data', 'D2', 'a25', '#668c75')];
  } else {
    components.push(mount(components, 'resistor', 'resistor', 'b29'));
    components.push(mount(components, 'led', 'led', 'c33'));
    // Resistor b29→b33 and LED c33→c34 share column 33, physically in series.
    wires = [wire('led-signal', id === 'led-millis' ? 'D13' : 'D8', 'a29', '#668c75'), wire('led-ground', 'GND', 'a34', '#525b69')];
  }
  return parseProject(JSON.stringify({ ...createProject(projectId), name, components, wires,
    programs: [{ componentId: 'uno', language: 'arduino-cpp', execution: 'unavailable', source: sketches[id] }] }));
}
