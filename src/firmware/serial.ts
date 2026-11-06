import type { Value } from './values';
export const MAX_SERIAL_CHARACTERS = 16384;
export interface SerialState { baudRate: number | null; output: string; truncated: boolean }
export const initialSerial = (): SerialState => ({ baudRate: null, output: '', truncated: false });
export function appendSerial(previous: SerialState, text: string, newline: boolean): SerialState {
  if (previous.baudRate === null) return previous;
  const output = previous.output + text + (newline ? '\r\n' : '');
  return { ...previous, output: output.slice(-MAX_SERIAL_CHARACTERS), truncated: previous.truncated || output.length > MAX_SERIAL_CHARACTERS };
}
export function serialNumber(value: Value, digits: number | null): string {
  if (Number.isNaN(value.value)) return 'nan';
  if (!Number.isFinite(value.value)) return value.value < 0 ? '-inf' : 'inf';
  return value.type === 'float' || digits !== null ? value.value.toFixed(digits ?? 2) : String(value.value);
}
