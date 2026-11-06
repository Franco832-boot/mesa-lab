import type { BoardKind } from '../model/types';
import type { BinaryOperator, ValueType } from './ast';
import { fail } from './errors';
import type { SourceSpan } from './errors';

export interface Value {
  type: ValueType;
  value: number;
}
const UINT_MODULUS = 0x1_0000_0000n;
export function convert(
  value: number | bigint,
  type: ValueType,
  board: BoardKind,
  at: SourceSpan,
): Value {
  if (type === 'bool') return { type, value: Number(value !== 0 && value !== 0n) };
  const integer = BigInt(value);
  if (type === 'unsigned long')
    return { type, value: Number(((integer % UINT_MODULUS) + UINT_MODULUS) % UINT_MODULUS) };
  const bits = type === 'int' && board === 'arduino-uno' ? 16n : 32n;
  const maximum = (1n << (bits - 1n)) - 1n;
  if (integer < -maximum - 1n || integer > maximum) fail('arithmetic-error', at);
  return { type, value: Number(integer) };
}
export function integerLiteral(token: string, board: BoardKind, at: SourceSpan): Value | null {
  if (!/^[0-9]/.test(token)) return null;
  const match = /^(0|[1-9][0-9]*)([uU][lL]?|[lL][uU]?)?$/.exec(token);
  if (!match?.[1]) return fail('invalid-value', at);
  const n = Number(match[1]),
    suffix = match[2]?.toLowerCase() ?? '';
  if (!Number.isSafeInteger(n) || n > 0xffffffff) return fail('invalid-value', at);
  // U-only is deliberately unsupported until unsigned-int semantics are added.
  if (suffix === 'u') return fail('unsupported-syntax', at);
  const type = suffix.includes('u')
    ? 'unsigned long'
    : suffix === 'l' || n > (board === 'arduino-uno' ? 32767 : 2147483647)
      ? 'long'
      : 'int';
  return convert(n, type, board, at);
}
function promoted(type: ValueType): ValueType {
  return type === 'bool' ? 'int' : type;
}
export function unary(
  operator: '+' | '-' | '!',
  value: Value,
  board: BoardKind,
  at: SourceSpan,
): Value {
  if (operator === '!') return { type: 'bool', value: Number(value.value === 0) };
  return convert(operator === '-' ? -value.value : value.value, promoted(value.type), board, at);
}
export function binary(
  operator: BinaryOperator,
  a: Value,
  b: Value,
  board: BoardKind,
  at: SourceSpan,
): Value {
  const type =
    a.type === 'unsigned long' || b.type === 'unsigned long'
      ? 'unsigned long'
      : a.type === 'long' || b.type === 'long'
        ? 'long'
        : 'int';
  const left = BigInt(convert(a.value, type, board, at).value),
    right = BigInt(convert(b.value, type, board, at).value);
  let value: bigint;
  switch (operator) {
    case '+':
      value = left + right;
      break;
    case '-':
      value = left - right;
      break;
    case '*':
      value = left * right;
      break;
    case '/':
    case '%':
      if (right === 0n) return fail('arithmetic-error', at);
      value = operator === '/' ? left / right : left % right;
      break;
    case '==':
      return { type: 'bool', value: Number(left === right) };
    case '!=':
      return { type: 'bool', value: Number(left !== right) };
    case '<':
      return { type: 'bool', value: Number(left < right) };
    case '<=':
      return { type: 'bool', value: Number(left <= right) };
    case '>':
      return { type: 'bool', value: Number(left > right) };
    case '>=':
      return { type: 'bool', value: Number(left >= right) };
    case '&&':
      return { type: 'bool', value: Number(a.value !== 0 && b.value !== 0) };
    case '||':
      return { type: 'bool', value: Number(a.value !== 0 || b.value !== 0) };
  }
  return convert(value, type, board, at);
}
