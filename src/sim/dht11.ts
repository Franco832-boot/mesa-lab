import type { CircuitProject } from '../model/types';
import { getPin } from '../model/components';
import { DHT11_LIMITS, validDhtEnvironment } from '../model/dht11';
import type { DhtObservation } from '../model/dht11';
import { evaluateCircuit } from './engine';
import { gpioConfiguration } from './gpio';
import { ownInput, pinKey, resolveTopology } from './topology';
import type { SimulationInputs } from './types';

/** Circuit observation only. API caching and sampling time live in the library runtime. */
export function observeDht11(project: CircuitProject, inputs: SimulationInputs, boardId: string, pinId: string): DhtObservation | null {
  const board = project.components.find((item) => item.id === boardId);
  if (!board || (board.kind !== 'arduino-uno' && board.kind !== 'esp8266')) return null;
  const pin = getPin(board.kind, pinId);
  if (pin?.gpio === undefined) return null;
  const topology = resolveTopology(project, inputs);
  const node = (id: string, terminal: string) => topology.nodeByPin.get(pinKey(id, terminal));
  const dataNode = node(boardId, pinId);
  const candidates = project.components.filter((item) => item.kind === 'dht11' && node(item.id, 'DATA') === dataNode);
  const sensor = candidates.length === 1 ? candidates[0] : undefined;
  if (!sensor || sensor.kind !== 'dht11' || dataNode === undefined) return null;
  if (!topology.connectedPins.has(pinKey(sensor.id, 'VCC'))) return null;
  if (node(sensor.id, 'GND') !== node(boardId, 'GND')) return null;
  // An actively driven bus cannot accept a sensor response. Check all GPIO aliases.
  for (const component of project.components) {
    if (component.kind !== 'arduino-uno' && component.kind !== 'esp8266') continue;
    for (const contact of topology.pinsByNode.get(dataNode) ?? []) {
      if (contact.componentId !== component.id) continue;
      const definition = getPin(component.kind, contact.pinId);
      if (definition?.gpio !== undefined && gpioConfiguration(component, definition, inputs).mode === 'output') return null;
    }
  }
  const snapshot = evaluateCircuit(project, inputs);
  const voltage = (terminal: string) => snapshot.pins[pinKey(sensor.id, terminal)]?.voltage;
  const vcc = voltage('VCC'), ground = voltage('GND'), data = voltage('DATA');
  if (vcc === undefined || ground === undefined || data === undefined) return null;
  const supply = vcc - ground, idle = data - ground;
  if (supply < DHT11_LIMITS.supplyMin - 1e-9 || supply > DHT11_LIMITS.supplyMax + 1e-9
    || idle < supply * 0.7 || idle > supply + 0.3 || idle > board.properties.logicVoltage + 0.3
    || snapshot.pins[pinKey(boardId, pinId)]?.logic !== 'HIGH') return null;
  const environment = ownInput(inputs.dht11, sensor.id) ?? sensor.properties;
  return validDhtEnvironment(environment) ? { sensorId: sensor.id, temperature: Math.round(environment.temperature), humidity: Math.round(environment.humidity) } : null;
}
