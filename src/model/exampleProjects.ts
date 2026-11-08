import { espWebExampleFiles } from './espWebExample';
import dhtSource from '../../examples/arduino/dht11-project.ino?raw';
import millisSource from '../../examples/arduino/blink-without-delay.ino?raw';
import forSource from '../../examples/arduino/led-for.ino?raw';
import type { TranslationKey } from '../locales/es/messages';
import { createComponent, newId } from './components';
import { mountExampleComponent as mount } from './examplePlacement';
import { createLcdExample } from './lcdExamples';
import type { LcdExampleId } from './lcdExamples';
import { createProject, parseProject } from './project';
import type { CircuitProject, ComponentKind, ElectronicComponent, Wire } from './types';

export type ExampleCategory = 'basics' | 'sensors' | 'displays' | 'communication';
export type ExampleId = 'dht11' | 'led-millis' | 'led-for' | 'esp-web-led' | LcdExampleId;
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
  { id: 'esp-web-led', name: 'exampleEspWebName', description: 'exampleEspWebDescription', category: 'communication', components: ['esp8266', 'breadboard', 'led', 'resistor'] },
  { id: 'dht11', name: 'exampleDhtName', description: 'exampleDhtDescription', category: 'sensors', components: ['arduino-uno', 'breadboard', 'dht11'] },
  { id: 'led-millis', name: 'exampleMillisName', description: 'exampleMillisDescription', category: 'basics', components: ['arduino-uno', 'breadboard', 'led', 'resistor'] },
  { id: 'led-for', name: 'exampleForName', description: 'exampleForDescription', category: 'basics', components: ['arduino-uno', 'breadboard', 'led', 'resistor'] },
  { id: 'lcd16-parallel', name: 'exampleLcd16Parallel', description: 'exampleLcdParallelDescription', category: 'displays', components: ['arduino-uno','breadboard','lcd-16x2','potentiometer','resistor'] },
  { id: 'lcd20-parallel', name: 'exampleLcd20Parallel', description: 'exampleLcdParallelDescription', category: 'displays', components: ['arduino-uno','breadboard','lcd-20x4','potentiometer','resistor'] },
  { id: 'lcd16-i2c', name: 'exampleLcd16I2c', description: 'exampleLcdI2cDescription', category: 'displays', components: ['arduino-uno','breadboard','lcd-16x2','pcf8574'] },
  { id: 'lcd20-i2c', name: 'exampleLcd20I2c', description: 'exampleLcdI2cDescription', category: 'displays', components: ['arduino-uno','breadboard','lcd-20x4','pcf8574'] },
] as const satisfies readonly ProjectExample[];
export const availableExampleCategories: readonly ExampleCategory[] = [...new Set(projectExamples.map((item) => item.category))];

const sketches: Readonly<Record<'dht11' | 'led-millis' | 'led-for', string>> = { dht11: dhtSource, 'led-millis': millisSource, 'led-for': forSource };

function wire(id: string, pinId: string, holeId: string, color: string): Wire {
  return { id, from: { componentId: 'uno', pinId }, to: { componentId: 'breadboard', pinId: holeId }, color, waypoints: [] };
}
/** Each call creates a fresh, validated ordinary v1 project. Footprints and
 * dimensions come exclusively from the shared physical registry. */
export function createExampleProject(id: ExampleId, name: string, projectId = newId()): CircuitProject {
  if (id === 'lcd16-parallel' || id === 'lcd20-parallel' || id === 'lcd16-i2c' || id === 'lcd20-i2c') return createLcdExample(id, name, projectId);
  const components: ElectronicComponent[] = [
    createComponent(id === 'esp-web-led' ? 'esp8266' : 'arduino-uno', { x: 80, y: 60 }, id === 'esp-web-led' ? 'esp' : 'uno'),
    createComponent('breadboard', { x: 50, y: 350 }, 'breadboard'),
  ];
  let wires: Wire[];
  if (id === 'dht11') {
    components.push(mount(components, 'dht11', 'sensor', 'b25'));
    wires = [wire('sensor-vcc', '5V', 'a26', '#bd665c'), wire('sensor-ground', 'GND', 'a27', '#525b69'), wire('sensor-data', 'D2', 'a25', '#668c75')];
  } else {
    components.push(mount(components, 'resistor', 'resistor', 'b29'));
    components.push(mount(components, 'led', 'led', 'c33'));
    if (id === 'esp-web-led') {
      const resistor = components.find((part) => part.kind === 'resistor');
      if (resistor?.kind === 'resistor') resistor.properties.resistance = 220;
    }
    // Resistor b29→b33 and LED c33→c34 share column 33, physically in series.
    wires = [wire('led-signal', id === 'esp-web-led' ? 'D5' : id === 'led-millis' ? 'D13' : 'D8', 'a29', '#668c75'), wire('led-ground', 'GND', 'a34', '#525b69')];
  }
  if (id === 'esp-web-led') wires = wires.map((item) => ({ ...item, from: { ...item.from, componentId: 'esp' } }));
  const files = id === 'esp-web-led' ? espWebExampleFiles() : undefined;
  return parseProject(JSON.stringify({ ...createProject(projectId), name, components, wires,
    programs: [{ componentId: id === 'esp-web-led' ? 'esp' : 'uno', language: 'arduino-cpp', execution: 'unavailable', source: id === 'esp-web-led' ? files?.[0]?.source ?? '' : sketches[id], ...(files ? { files, activeFile: 'main.ino' } : {}) }] }));
}
