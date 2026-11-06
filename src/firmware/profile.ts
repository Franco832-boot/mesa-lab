import type { BoardKind } from '../model/types';
import { gpioPins } from '../sim/gpio';
import type { GpioCall } from './ast';
import { fail, MAX_DELAY_MS } from './errors';
import type { SourceSpan } from './errors';
import { integerLiteral } from './values';
import type { Value } from './values';

export function constantValue(token: string, board: BoardKind, at: SourceSpan): Value | null {
  const number = integerLiteral(token, board, at);
  if (number) return number;
  if (token === 'true' || token === 'false') return { type: 'bool', value: Number(token === 'true') };
  if (token === 'HIGH' || token === 'OUTPUT') return { type: 'int', value: 1 };
  if (token === 'LOW' || token === 'INPUT') return { type: 'int', value: 0 };
  if (token === 'LED_BUILTIN') return { type: 'int', value: board === 'arduino-uno' ? 13 : 2 };
  const pin = gpioPins(board).find((item) => item.id === token);
  if (pin?.gpio !== undefined && (board === 'esp8266' ? /^D[0-8]$/ : /^A[0-5]$/).test(token)) return { type: 'int', value: pin.gpio };
  return null;
}
export type BuiltinEffect =
  | { kind: 'wait'; microseconds: number }
  | { kind: 'mode'; pinId: string; mode: 'input' | 'output' }
  | { kind: 'write'; pinId: string; level: 'HIGH' | 'LOW' };

/** Shared by constant-call compilation checks and dynamic VM dispatch. */
export function builtinEffect(name: GpioCall, args: readonly Value[], board: BoardKind, at: SourceSpan): BuiltinEffect {
  const value = args[0]?.value ?? fail('invalid-value', at);
  if (name === 'delay' || name === 'delayMicroseconds') {
    const microseconds = value * (name === 'delay' ? 1000 : 1);
    if (!Number.isSafeInteger(microseconds) || microseconds < 0 || microseconds > MAX_DELAY_MS * 1000) fail('invalid-value', at);
    return { kind: 'wait', microseconds };
  }
  const pin = gpioPins(board).find((item) => item.gpio === value);
  if (!pin) return fail('invalid-value', at);
  const level = args[1]?.value;
  if (level !== 0 && level !== 1) return fail('invalid-value', at);
  return name === 'pinMode' ? { kind: 'mode', pinId: pin.id, mode: level === 1 ? 'output' : 'input' }
    : { kind: 'write', pinId: pin.id, level: level === 1 ? 'HIGH' : 'LOW' };
}
