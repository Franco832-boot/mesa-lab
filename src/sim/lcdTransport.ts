import { LCD_CONTROL_TERMINALS, isLcdKind, lcdGeometry } from '../model/lcd';
import type { LcdBus, LcdOperation } from '../model/lcd';
import type { CircuitProject } from '../model/types';
import { evaluateCircuit } from './engine';
import { ownInput, pinKey, resolveTopology } from './topology';
import type { SimulationInputs } from './types';
import { initialLcd, lcdOperationBytes, writeLcdNibble } from './hd44780';
import { getPin } from '../model/components';
import { gpioConfiguration } from './gpio';

/** A write-only 4-bit transaction must reach the exact declared terminals and
 * be electrically able to drive both logic states. No closed DATA load loop. */
export function resolveParallelLcd(project: CircuitProject, inputs: SimulationInputs, boardId: string, bus: LcdBus): string | null {
  if (bus.kind !== 'parallel' || bus.pins.length !== 6 || project.components.find((part) => part.id === boardId)?.kind !== 'arduino-uno') return null;
  const topology = resolveTopology(project, inputs);
  const node = (id: string, terminal: string) => topology.nodeByPin.get(pinKey(id, terminal));
  const signals = bus.pins.map((pin) => node(boardId, pin));
  if (signals.some((signal) => signal === undefined) || new Set(signals).size !== 6) return null;
  const board = project.components.find((part) => part.id === boardId);
  if (board?.kind !== 'arduino-uno' || bus.pins.some((id) => {
    const pin = getPin(board.kind, id);
    return !pin || gpioConfiguration(board, pin, inputs).mode !== 'output';
  })) return null;
  for (const [index, net] of signals.entries()) for (const contact of topology.pinsByNode.get(net ?? '') ?? []) {
    const owner = project.components.find((part) => part.id === contact.componentId);
    if (owner?.kind !== 'arduino-uno' && owner?.kind !== 'esp8266') continue;
    const pin = getPin(owner.kind, contact.pinId), expected = getPin(board.kind, bus.pins[index] ?? '');
    if (pin?.gpio !== undefined && gpioConfiguration(owner, pin, inputs).mode === 'output' && (owner.id !== boardId || pin.gpio !== expected?.gpio)) return null;
  }
  const candidates = project.components.filter((part) => isLcdKind(part.kind) && lcdGeometry(part.kind).columns === bus.columns && lcdGeometry(part.kind).rows === bus.rows
    && node(part.id, 'VSS') === node(boardId, 'GND') && node(part.id, 'RW') === node(part.id, 'VSS')
    && LCD_CONTROL_TERMINALS.every((terminal, index) => node(part.id, terminal) === signals[index]));
  const target = candidates.length === 1 ? candidates[0] : undefined;
  if (!target) return null;
  for (const level of ['LOW', 'HIGH'] as const) {
    const gpio = { ...inputs.gpio };
    for (const pin of bus.pins) gpio[pinKey(boardId, pin)] = { mode: 'output', level };
    const snapshot = evaluateCircuit(project, { ...inputs, gpio });
    if (!snapshot.components[target.id]?.lcd?.powered) return null;
    const ground = snapshot.pins[pinKey(target.id, 'VSS')]?.voltage;
    if (ground === undefined || !LCD_CONTROL_TERMINALS.every((terminal) => {
      const voltage = snapshot.pins[pinKey(target.id, terminal)]?.voltage;
      return voltage !== undefined && (level === 'HIGH' ? voltage - ground >= 2.2 && voltage - ground <= 5.5 : voltage - ground >= -0.3 && voltage - ground <= .6);
    })) return null;
  }
  return target.id;
}
export function writeParallelLcd(inputs: SimulationInputs, id: string, bus: LcdBus, operation: LcdOperation): SimulationInputs {
  let controller = ownInput(inputs.lcd, id) ?? initialLcd();
  for (const value of lcdOperationBytes(controller, bus, operation)) {
    controller = writeLcdNibble(controller, value.data, value.byte >> 4);
    controller = writeLcdNibble(controller, value.data, value.byte & 15);
  }
  return { ...inputs, lcd: { ...inputs.lcd, [id]: { ...controller, connection: 'parallel' } } };
}
