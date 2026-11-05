import { describe, expect, it } from 'vitest';
import { createProject, MAX_PROJECT_BYTES, parseProject, serializeProject } from './project';
import { projectWithData } from '../test/fixtures';

describe('versioned circuit project', () => {
  it('creates an unpowered reference desk without invented simulation data', () => {
    const project = createProject();
    expect(new Set(project.components.map((item) => item.id)).size).toBe(3);
    expect(project.wires).toEqual([]);
    expect(project.programs).toEqual([]);
  });
  it('roundtrips positions, properties, connections, routes and code', () => {
    const project = projectWithData();
    expect(parseProject(serializeProject(project))).toEqual(project);
  });
  it('rejects unsupported format versions', () => {
    expect(() => parseProject(JSON.stringify({ ...createProject(), version: 2 }))).toThrow(
      'unsupported-format',
    );
  });
  it('rejects malformed input and excessive file sizes', () => {
    expect(() => parseProject('{')).toThrow();
    expect(() => parseProject(' '.repeat(MAX_PROJECT_BYTES + 1))).toThrow('project-too-large');
  });
  it('rejects duplicate component IDs', () => {
    const project = createProject();
    const first = project.components[0];
    if (!first) throw new Error('Missing fixture');
    project.components.push(first);
    expect(() => parseProject(JSON.stringify(project))).toThrow('duplicate-component');
  });
  it('rejects dangling component references and self-connected terminals', () => {
    const project = projectWithData();
    const wire = project.wires[0];
    if (!wire) throw new Error('Missing fixture');
    wire.to.componentId = 'missing';
    expect(() => parseProject(JSON.stringify(project))).toThrow('invalid-wire-reference');
    wire.to = { ...wire.from };
    expect(() => parseProject(JSON.stringify(project))).toThrow('invalid-wire-reference');
  });
  it('rejects programs associated with a non-board component', () => {
    const project = projectWithData();
    const program = project.programs[0];
    if (!program) throw new Error('Missing fixture');
    program.componentId = 'led-1';
    expect(() => parseProject(JSON.stringify(project))).toThrow('invalid-program-reference');
  });
  it('rejects wrong voltage configuration, invalid properties and non-finite coordinates', () => {
    const project = createProject();
    const bad = {
      ...project,
      components: [
        {
          id: 'esp',
          kind: 'esp8266',
          position: { x: 0, y: 0 },
          rotation: 0,
          properties: { logicVoltage: 5 },
        },
      ],
    };
    expect(() => parseProject(JSON.stringify(bad))).toThrow('invalid-project');
    expect(() =>
      parseProject(JSON.stringify({ ...project, viewport: { zoom: 0, offset: { x: 0, y: 0 } } })),
    ).toThrow('invalid-project');
    const first = project.components[0];
    if (!first) throw new Error('Missing fixture');
    first.position.x = Infinity;
    expect(() => parseProject(JSON.stringify(project))).toThrow('invalid-project');
  });
  it('removes foreign fields and runtime state at document boundaries', () => {
    const project = createProject();
    const data = {
      ...project,
      simulationActive: true,
      selection: ['uno-reference'],
      components: project.components.map((item) => ({
        ...item,
        electricalState: { logic: 'HIGH' },
        properties: { ...item.properties, runtime: 'temporary' },
      })),
    };
    expect(parseProject(JSON.stringify(data))).toEqual(project);
  });
});
