import { createProject } from '../model/project';
import type { CircuitProject } from '../model/types';

export function projectWithData(): CircuitProject {
  const project = createProject('test-project');
  project.name = 'Laboratorio IoT';
  project.components.push({
    id: 'led-1',
    kind: 'led',
    position: { x: 800, y: 250 },
    rotation: 90,
    properties: { color: 'green' },
  });
  project.components.push(
    {
      id: 'r-1',
      kind: 'resistor',
      position: { x: 720, y: 330 },
      rotation: 180,
      properties: { resistance: 330 },
    },
    {
      id: 'button-1',
      kind: 'pushbutton',
      position: { x: 800, y: 400 },
      rotation: 0,
      properties: { normallyClosed: false },
    },
    {
      id: 'pot-1',
      kind: 'potentiometer',
      position: { x: 820, y: 500 },
      rotation: -90,
      properties: { resistance: 10000, ratio: 0.4 },
    },
    {
      id: 'supply-1',
      kind: 'power-supply',
      position: { x: 500, y: 700 },
      rotation: 0,
      properties: { voltage: 3.3 },
    },
  );
  project.wires.push({
    id: 'wire-1',
    from: { componentId: 'esp-reference', pinId: 'D1' },
    to: { componentId: 'led-1', pinId: 'anode' },
    color: '#00aa88',
    waypoints: [{ x: 750, y: 200 }],
  });
  project.programs.push({
    componentId: 'esp-reference',
    language: 'arduino-cpp',
    source: 'void setup() { pinMode(5, OUTPUT); }\nvoid loop() {}',
    execution: 'unavailable',
  });
  return project;
}
