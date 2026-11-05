import { describe, expect, it } from 'vitest';
import { createComponent } from '../model/components';
import { createProject } from '../model/project';
import type { CircuitProject, ComponentKind, Wire } from '../model/types';
import { pinKey, resolveTopology } from './topology';

const fixture = (...kinds: ComponentKind[]): CircuitProject => ({
  ...createProject(),
  components: kinds.map((kind, index) => createComponent(kind, { x: 0, y: 0 }, `c${index}`)),
  wires: [],
});
const node = (project: CircuitProject, component: string, pin: string) =>
  resolveTopology(project).nodeByPin.get(pinKey(component, pin));
const wire: Wire = {
  id: 'w', from: { componentId: 'c0', pinId: '1' },
  to: { componentId: 'c1', pinId: 'anode' }, color: '#000000', waypoints: [],
};
describe('electrical connectivity', () => {
  it('uses collision-safe stable pin keys', () => {
    expect(pinKey('a:b', 'c')).not.toBe(pinKey('a', 'b:c'));
  });
  it('joins actual wire terminal references without geometry assumptions', () => {
    const project = fixture('resistor', 'led');
    project.wires.push(wire);
    expect(node(project, 'c0', '1')).toBe(node(project, 'c1', 'anode'));
    expect(node(project, 'c0', '2')).not.toBe(node(project, 'c1', 'anode'));
  });
  it('keeps each five-hole strip continuous but adjacent columns isolated', () => {
    const project = fixture('breadboard');
    for (const pin of ['a1', 'b1', 'c1', 'd1', 'e1']) expect(node(project, 'c0', pin)).toBe(node(project, 'c0', 'a1'));
    expect(node(project, 'c0', 'a1')).not.toBe(node(project, 'c0', 'a2'));
  });
  it('isolates both sides of the center gap and all four rails', () => {
    const project = fixture('breadboard');
    expect(node(project, 'c0', 'e1')).not.toBe(node(project, 'c0', 'f1'));
    expect(new Set(['tp1', 'tn1', 'bp1', 'bn1'].map((pin) => node(project, 'c0', pin))).size).toBe(4);
  });
  it('follows the represented continuous rails across the middle (no split variant in SVG)', () => {
    const project = fixture('breadboard');
    for (const rail of ['tp', 'tn', 'bp', 'bn']) {
      expect(node(project, 'c0', `${rail}1`)).toBe(node(project, 'c0', `${rail}50`));
      expect(node(project, 'c0', `${rail}25`)).toBe(node(project, 'c0', `${rail}26`));
    }
    expect(resolveTopology(project).pinsByNode.size).toBe(130);
  });
  it('does not infer connections by overlapping component positions', () => {
    const project = fixture('led', 'led');
    expect(node(project, 'c0', 'anode')).not.toBe(node(project, 'c1', 'anode'));
  });
  it('detects invalid component and terminal references without joining either', () => {
    const project = fixture('resistor', 'led');
    project.wires = [{ ...wire, to: { componentId: 'c1', pinId: 'missing' } },
      { ...wire, id: 'w2', to: { componentId: 'missing', pinId: 'anode' } }];
    expect(resolveTopology(project).diagnostics.filter((issue) => issue.code === 'invalid-reference')).toHaveLength(2);
    expect(node(project, 'c0', '1')).not.toBe(node(project, 'c1', 'anode'));
  });
  it('reports completely disconnected components', () => {
    expect(resolveTopology(fixture('resistor')).diagnostics).toContainEqual({
      code: 'disconnected-component', severity: 'warning', componentIds: ['c0'], pinIds: [],
    });
  });
  it('does not treat inherited object properties as transient overrides', () => {
    for (const id of ['__proto__', 'constructor', 'toString']) {
      const project = fixture('pushbutton');
      const component = project.components[0];
      if (!component) throw new Error('fixture');
      component.id = id;
      const topology = resolveTopology(project, { buttons: {} });
      expect(topology.nodeByPin.get(pinKey(id, '1'))).not.toBe(topology.nodeByPin.get(pinKey(id, '2')));
    }
  });
  it('is deterministic when components and wires are reordered', () => {
    const project = fixture('resistor', 'led');
    project.wires = [wire];
    expect([...resolveTopology(project).nodeByPin]).toEqual([...resolveTopology({ ...project, components: [...project.components].reverse() }).nodeByPin]);
  });
});
