import { isLcdKind, LCD_CONTROL_TERMINALS, lcdGeometry } from '../model/lcd';
import type { LcdBus, LcdOperation } from '../model/lcd';
import type { CircuitProject } from '../model/types';
import type { SimulationInputs } from './types';
import { ownInput, pinKey, resolveTopology } from './topology';
import { evaluateCircuit } from './engine';
import { gpioConfiguration } from './gpio';
import { getPin } from '../model/components';
import { initialLcd, lcdOperationBytes } from './hd44780';
import { pcfLcdByte, pcfLcdPulses } from './pcf8574';

export interface I2cLcdTarget { adapterId: string; lcdId: string | null }
/** Addressed I²C transaction routing, not a full bit-level bus emulator. */
export function resolveI2cLcd(project: CircuitProject, inputs: SimulationInputs, boardId: string, bus: LcdBus): I2cLcdTarget | null {
  if (bus.kind !== 'i2c' || project.components.find((part) => part.id === boardId)?.kind !== 'arduino-uno') return null;
  const topology = resolveTopology(project, inputs), snapshot = evaluateCircuit(project, inputs);
  const node = (id: string, pin: string) => topology.nodeByPin.get(pinKey(id, pin));
  const sda = node(boardId, 'A4'), scl = node(boardId, 'A5'), groundNode = node(boardId, 'GND');
  if (sda === undefined || scl === undefined || sda === scl) return null;
  // Push-pull output modes are not a valid released I²C bus, even if HIGH.
  for (const net of [sda, scl]) for (const pin of topology.pinsByNode.get(net) ?? []) {
    const owner = project.components.find((part) => part.id === pin.componentId), contact = owner ? getPin(owner.kind, pin.pinId) : undefined;
    if (owner && contact && (owner.kind === 'arduino-uno' || owner.kind === 'esp8266') && contact.gpio !== undefined && gpioConfiguration(owner, contact, inputs).mode === 'output') return null;
  }
  const adapters = project.components.filter((part) => part.kind === 'pcf8574' && part.properties.address === bus.address && node(part.id, 'SDA') === sda && node(part.id, 'SCL') === scl);
  const adapter = adapters.length === 1 ? adapters[0] : undefined;
  if (!adapter || adapter.kind !== 'pcf8574' || node(adapter.id, 'GND') !== groundNode) return null;
  const voltage = (id: string, terminal: string) => snapshot.pins[pinKey(id, terminal)]?.voltage;
  const ground = voltage(adapter.id, 'GND'), vcc = voltage(adapter.id, 'VCC');
  if (ground === undefined || vcc === undefined || vcc - ground < 4.5 || vcc - ground > 5.5) return null;
  if (!['SDA','SCL'].every((terminal) => { const v = voltage(adapter.id, terminal); return v !== undefined && v - ground >= .7 * (vcc - ground) && v - ground <= 5.5; })) return null;
  const candidates = project.components.filter((part) => isLcdKind(part.kind) && lcdGeometry(part.kind).columns === bus.columns && lcdGeometry(part.kind).rows === bus.rows
    && node(part.id, 'VSS') === groundNode && node(part.id, 'RW') === node(adapter.id, 'LCD_RW')
    && LCD_CONTROL_TERMINALS.every((terminal) => node(part.id, terminal) === node(adapter.id, `LCD_${terminal}`)));
  const lcd = candidates.length === 1 ? candidates[0] : undefined;
  if (!lcd) return { adapterId: adapter.id, lcdId: null };
  const nets = [...LCD_CONTROL_TERMINALS, 'RW'].map((terminal) => node(lcd.id, terminal));
  if (new Set(nets).size !== 7) return { adapterId: adapter.id, lcdId: null };
  for (const high of [false, true]) {
    const latch = (high ? 0xf5 : 0) | ((ownInput(inputs.pcf8574, adapter.id) ?? 0) & 8);
    const probe = evaluateCircuit(project, { ...inputs, pcf8574: { ...inputs.pcf8574, [adapter.id]: latch } });
    if (!probe.components[lcd.id]?.lcd?.powered) return { adapterId: adapter.id, lcdId: null };
    const valid = [...LCD_CONTROL_TERMINALS, 'RW'].every((terminal) => {
      const v = probe.pins[pinKey(lcd.id, terminal)]?.voltage;
      return v !== undefined && (high && terminal !== 'RW' ? v - ground >= 2.2 && v - ground <= 5.5 : v - ground >= -.3 && v - ground <= .6);
    });
    if (!valid) return { adapterId: adapter.id, lcdId: null };
  }
  return { adapterId: adapter.id, lcdId: lcd.id };
}
export function writeI2cLcd(inputs: SimulationInputs, target: I2cLcdTarget, bus: LcdBus, operation: LcdOperation): SimulationInputs {
  let latch = ownInput(inputs.pcf8574, target.adapterId) ?? 0;
  let controller = (target.lcdId ? ownInput(inputs.lcd, target.lcdId) : undefined) ?? initialLcd();
  const backlight = operation.kind === 'flag' && operation.flag === 'backlight' ? operation.enabled : (latch & 8) !== 0;
  if (operation.kind === 'flag' && operation.flag === 'backlight') latch = (latch & ~8) | (backlight ? 8 : 0);
  for (const byte of lcdOperationBytes(controller, bus, operation)) for (const value of pcfLcdPulses(byte.byte, byte.data, backlight)) {
    if (target.lcdId) controller = pcfLcdByte(controller, latch, value);
    latch = value;
  }
  return { ...inputs, pcf8574: { ...inputs.pcf8574, [target.adapterId]: latch },
    ...(target.lcdId ? { lcd: { ...inputs.lcd, [target.lcdId]: { ...controller, connection: 'i2c' } } } : {}) };
}
