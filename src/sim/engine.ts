import { componentDefinitions } from '../model/components';
import type { CircuitProject } from '../model/types';
import { evaluateDc } from './dc';
import { validateInputs } from './inputs';
import { evaluateGpio } from './gpio';
import { ownInput } from './topology';
import { buildModels } from './models';
import type { Branch } from './models';
import { pinKey, resolveTopology } from './topology';
import type { ComponentResult, ElectricalSnapshot, PinResult, SimulationInputs, SimulationIssue } from './types';

export const MAX_SIMULATION_PINS = 12000;

function hasReturnPath(branch: Branch, branches: readonly Branch[]): boolean {
  if (branch.a === branch.b) return true;
  const graph = new Map<string, string[]>();
  for (const edge of branches) if (edge.id !== branch.id) {
    graph.set(edge.a, [...(graph.get(edge.a) ?? []), edge.b]);
    graph.set(edge.b, [...(graph.get(edge.b) ?? []), edge.a]);
  }
  const visited = new Set([branch.a]);
  const queue = [branch.a];
  for (let index = 0; index < queue.length; index++) {
    const node = queue[index];
    if (node === undefined) continue;
    for (const next of graph.get(node) ?? []) {
      if (next === branch.b) return true;
      if (!visited.has(next)) { visited.add(next); queue.push(next); }
    }
  }
  return false;
}

/** Pure DC evaluation. No clocks, global state, DOM, Redux, or React. */
export function evaluateCircuit(project: CircuitProject, inputs: SimulationInputs = {}): ElectricalSnapshot {
  // Bound topology allocation as well as the DC matrix. The editor can retain
  // larger documents without allocating hundreds of thousands of runtime pins.
  const pinCount = project.components.reduce((count, component) =>
    count + componentDefinitions[component.kind].pins.length, 0);
  if (pinCount > MAX_SIMULATION_PINS) return {
    pins: {},
    components: Object.fromEntries(project.components.map((component) => [component.id, {
      condition: 'warning', ...(component.kind === 'led' ? { brightness: 0 } : {}),
    }])),
    diagnostics: [{ code: 'unsupported-network', severity: 'warning', componentIds: project.components.map((component) => component.id), pinIds: [] }],
  };
  const topology = resolveTopology(project, inputs);
  const models = buildModels(project, topology, inputs);
  const diagnostics: SimulationIssue[] = [...topology.diagnostics, ...validateInputs(project, inputs), ...models.diagnostics];
  if (diagnostics.some((issue) => issue.code === 'invalid-reference' || issue.code === 'invalid-input')) {
    return {
      pins: Object.fromEntries([...topology.nodeByPin.keys()].map((key) => [key, { logic: 'FLOATING' }])),
      components: Object.fromEntries(project.components.map((component) => [component.id, { condition: 'warning', ...(component.kind === 'led' ? { brightness: 0 } : {}) }])),
      diagnostics,
    };
  }
  const dc = evaluateDc(models.branches);
  diagnostics.push(...dc.diagnostics);
  const gpio = evaluateGpio(project, topology, dc);
  diagnostics.push(...gpio.diagnostics);
  const pins: [string, PinResult][] = [];
  for (const [key, node] of topology.nodeByPin) {
    const voltage = dc.voltages.get(node);
    const gpioPin = gpio.pins.get(key);
    if (gpioPin) { pins.push([key, gpioPin]); continue; }
    pins.push([key, voltage === undefined ? { logic: 'FLOATING' } : { voltage, logic: 'UNDEFINED' }]);
  }
  const components = project.components.map((component): [string, ComponentResult] => {
    const branches = models.branches.filter((branch) => branch.componentId === component.id);
    const branch = branches[0];
    const state: ComponentResult = { condition: 'normal' };
    if (component.kind === 'led') state.brightness = 0;
    if (component.kind === 'pushbutton' && component.properties.normallyClosed !== (ownInput(inputs.buttons, component.id) ?? false)) state.condition = 'active';
    if (branch && component.kind !== 'arduino-uno' && component.kind !== 'esp8266') {
      const a = dc.voltages.get(branch.a), b = dc.voltages.get(branch.b);
      if (a !== undefined && b !== undefined && dc.references.get(branch.a) === dc.references.get(branch.b)) state.voltage = a - b;
      const current = dc.currents.get(branch.id);
      if (current !== undefined) state.current = current;
      if (current !== undefined && state.voltage !== undefined) state.power = Math.abs(current * state.voltage);
      if (component.kind === 'led' && current !== undefined) {
        state.brightness = Math.max(0, Math.min(1, current / 0.02));
        if (current > 1e-10) state.condition = 'active';
        if (current > 0.02 + 1e-10) diagnostics.push({ code: 'led-overcurrent', severity: 'warning', componentIds: [component.id], pinIds: ['anode', 'cathode'] });
        if (state.voltage !== undefined && state.voltage < -1e-8) diagnostics.push({ code: 'reverse-polarity', severity: 'warning', componentIds: [component.id], pinIds: ['anode', 'cathode'] });
      }
      if (component.kind === 'resistor' && state.power !== undefined && state.power > 0.25 + 1e-10) {
        state.condition = 'overheated';
        diagnostics.push({ code: 'resistor-overpower', severity: 'warning', componentIds: [component.id], pinIds: ['1', '2'] });
      }
      // A digital sensor validates its supply and bus separately; DATA does
      // not need the conducting series return path expected of passive loads.
      if (component.kind !== 'dht11' && !hasReturnPath(branch, models.branches)) {
        const hasExternalWire = componentDefinitions[component.kind].pins.some((pin) => topology.connectedPins.has(pinKey(component.id, pin.id)));
        if (hasExternalWire) diagnostics.push({ code: 'open-circuit', severity: 'warning', componentIds: [component.id], pinIds: [] });
      }
    }
    if (component.kind === 'dht11') {
      const currents = branches.map((segment) => dc.currents.get(segment.id));
      if (currents.every((current) => current !== undefined)) {
        // Both model branches start at VCC: standby plus the loaded pull-up.
        state.current = currents.reduce<number>((sum, current) => sum + (current ?? 0), 0);
        state.power = branches.reduce((sum, segment) => {
          const current = dc.currents.get(segment.id) ?? 0;
          return sum + current * current * segment.value;
        }, 0);
      }
    }
    if (component.kind === 'potentiometer') {
      const aNode = topology.nodeByPin.get(pinKey(component.id, '1'));
      const bNode = topology.nodeByPin.get(pinKey(component.id, '3'));
      const a = aNode === undefined ? undefined : dc.voltages.get(aNode);
      const b = bNode === undefined ? undefined : dc.voltages.get(bNode);
      if (a !== undefined && b !== undefined && aNode !== undefined && bNode !== undefined && dc.references.get(aNode) === dc.references.get(bNode)) state.voltage = a - b;
      const powers = branches.map((segment) => {
        const current = dc.currents.get(segment.id);
        return current === undefined ? undefined : current * current * segment.value;
      });
      if (powers.every((power) => power !== undefined)) state.power = powers.reduce<number>((sum, power) => sum + (power ?? 0), 0);
      // A loaded wiper has distinct terminal currents, so no single component current is reported.
      delete state.current;
    }
    if (diagnostics.some((issue) => issue.severity !== 'info' && issue.componentIds.includes(component.id)) && state.condition !== 'overheated') state.condition = 'warning';
    return [component.id, state];
  });
  return { pins: Object.fromEntries(pins), components: Object.fromEntries(components), diagnostics };
}
