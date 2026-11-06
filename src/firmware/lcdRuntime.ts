import { gpioPins } from '../sim/gpio';
import type { BoardKind } from '../model/types';
import { validPcfAddress } from '../model/lcd';
import type { LcdBus, LcdOperation } from '../model/lcd';
import { fail } from './errors';
import type { SourceSpan } from './errors';
import type { Value } from './values';
import { serialNumber } from './serial';

export interface LcdObject { type: 'lcd'; bus: LcdBus; began: boolean }
export function constructLcd(args: readonly number[], board: BoardKind, at: SourceSpan): LcdObject {
  if (board !== 'arduino-uno' || args.length !== 6) return fail('invalid-value', at);
  const pins = args.map((value) => gpioPins(board).find((pin) => pin.gpio === value)?.id ?? fail('invalid-value', at));
  if (new Set(pins).size !== 6) return fail('invalid-value', at);
  return { type: 'lcd', bus: { kind: 'parallel', pins, columns: 16, rows: 2 }, began: false };
}
export function constructI2cLcd(args: readonly number[], board: BoardKind, at: SourceSpan): LcdObject {
  const [address, columns, rows] = args;
  if (board !== 'arduino-uno' || address === undefined || !validPcfAddress(address) || !((columns === 16 && rows === 2) || (columns === 20 && rows === 4))) return fail('invalid-value', at);
  return { type: 'lcd', began: false, bus: { kind: 'i2c', address, columns, rows } };
}
export function lcdMethod(object: LcdObject, name: string, args: readonly Value[], at: SourceSpan): { object: LcdObject; operation: LcdOperation | null } {
  const integer = (index: number, max: number) => {
    const value = args[index]?.value;
    if (value === undefined || !Number.isInteger(value) || value < 0 || value > max) return fail('invalid-value', at);
    return value;
  };
  if (name === 'init' && object.bus.kind === 'i2c') return { object: { ...object, began: true }, operation: { kind: 'init' } };
  if (name === 'begin') {
    const columns = integer(0, 20), rows = integer(1, 4);
    if (!((columns === 16 && rows === 2) || (columns === 20 && rows === 4))) return fail('invalid-value', at);
    return { object: { ...object, began: true, bus: { ...object.bus, columns, rows } }, operation: { kind: 'init' } };
  }
  let operation: LcdOperation;
  switch (name) {
    case 'clear': case 'home': operation = { kind: name }; break;
    case 'setCursor': operation = { kind: 'position', column: integer(0, object.bus.columns - 1), row: integer(1, object.bus.rows - 1) }; break;
    case 'write': operation = { kind: 'print', text: String.fromCharCode(integer(0, 255)) }; break;
    case 'print': {
      const value = args[0] ?? fail('type-error', at), digits = args.length === 2 ? integer(1, 9) : null;
      if (digits !== null && value.type !== 'float') return fail('type-error', at);
      operation = { kind: 'print', text: serialNumber(value, digits) }; break;
    }
    case 'backlight': case 'noBacklight': operation = { kind: 'flag', flag: 'backlight', enabled: name === 'backlight' }; break;
    case 'cursor': case 'noCursor': operation = { kind: 'flag', flag: 'cursor', enabled: name === 'cursor' }; break;
    case 'blink': case 'noBlink': operation = { kind: 'flag', flag: 'blink', enabled: name === 'blink' }; break;
    case 'display': case 'noDisplay': operation = { kind: 'flag', flag: 'display', enabled: name === 'display' }; break;
    default: return fail('unsupported-syntax', at);
  }
  return { object, operation: object.began ? operation : null };
}
