import type { BoardKind, GpioState } from '../model/types';
import { gpioPins } from '../sim/gpio';

export const MAX_SOURCE_LENGTH = 32768;
export const MAX_PROGRAM_INSTRUCTIONS = 512;
export const MAX_ADVANCE_STEPS = 4096;
export const MAX_DELAY_MS = 86400000;
export type UnoErrorCode = 'unsupported-syntax' | 'invalid-value' | 'source-limit' | 'instruction-limit' | 'step-limit' | 'pin-not-output';
export class UnoExecutionError extends Error {
  constructor(readonly code: UnoErrorCode) {
    super(code);
    this.name = 'UnoExecutionError';
  }
}
export type ArduinoInstruction =
  | { type: 'pinMode'; pinId: string; mode: 'input' | 'output' }
  | { type: 'digitalWrite'; pinId: string; level: 'HIGH' | 'LOW' }
  | { type: 'delay'; milliseconds: number };
export interface UnoProgram {
  board: BoardKind;
  setup: readonly ArduinoInstruction[];
  loop: readonly ArduinoInstruction[];
}
export interface UnoExecution {
  program: UnoProgram;
  board: BoardKind;
  timeMs: number;
  phase: 'setup' | 'loop';
  pc: number;
  wakeAt: number | null;
  modes: Readonly<Record<string, 'input' | 'output'>>;
  levels: Readonly<Record<string, 'HIGH' | 'LOW'>>;
}
export interface UnoGpioEvent {
  atMs: number;
  pinId: string;
  state: GpioState;
}
export interface UnoAdvanceResult {
  execution: UnoExecution;
  gpio: readonly UnoGpioEvent[];
}
const fail = (code: UnoErrorCode): never => { throw new UnoExecutionError(code); };
function decimal(token: string | undefined, max: number): number {
  if (token === undefined || !/^(0|[1-9][0-9]*)$/.test(token)) return fail('invalid-value');
  const value = Number(token);
  return Number.isSafeInteger(value) && value <= max ? value : fail('invalid-value');
}
function resolvePin(token: string | undefined, board: BoardKind): string {
  const pins = gpioPins(board);
  if (token === 'LED_BUILTIN') return board === 'arduino-uno' ? 'D13' : 'D4';
  if (token && (board === 'arduino-uno' ? /^A[0-5]$/ : /^D[0-8]$/).test(token)) {
    const pin = pins.find((item) => item.id === token);
    return pin?.id ?? fail('invalid-value');
  }
  const number = decimal(token, board === 'arduino-uno' ? 19 : 16);
  return pins.find((item) => item.gpio === number)?.id ?? fail('invalid-value');
}
/** Strict Arduino-style direct-GPIO subset, not a C++ compiler or firmware emulator. */
export function compileArduinoSubset(source: string, board: BoardKind = 'arduino-uno'): UnoProgram {
  if (typeof source !== 'string' || source.length > MAX_SOURCE_LENGTH) return fail('source-limit');
  if (board !== 'arduino-uno' && board !== 'esp8266') return fail('invalid-value');
  if (/\\\r?\n/.test(source)) return fail('unsupported-syntax');
  let cleaned = '';
  for (let index = 0; index < source.length;) {
    if (source.startsWith('//', index)) {
      const end = source.indexOf('\n', index + 2);
      index = end < 0 ? source.length : end;
      cleaned += ' ';
    } else if (source.startsWith('/*', index)) {
      const end = source.indexOf('*/', index + 2);
      if (end < 0) return fail('unsupported-syntax');
      cleaned += source.slice(index, end + 2).replace(/[^\r\n]/g, ' ');
      index = end + 2;
    } else {
      cleaned += source[index];
      index++;
    }
  }
  // Arduino.h is supported only as a leading preprocessing directive.
  cleaned = cleaned.replace(/^\s*#\s*include\s*<Arduino\.h>[^\S\r\n]*(?:\r?\n|$)/, ' ');
  const tokens: string[] = [];
  const tokenPattern = /\s+|[A-Za-z_][A-Za-z_0-9]*|[0-9]+|[(){},;]/gy;
  let offset = 0;
  while (offset < cleaned.length) {
    tokenPattern.lastIndex = offset;
    const match = tokenPattern.exec(cleaned);
    if (!match) return fail('unsupported-syntax');
    const token = match[0];
    offset += token.length;
    if (!/^\s+$/.test(token)) tokens.push(token);
  }
  let cursor = 0, count = 0;
  const take = () => tokens[cursor++];
  const expect = (expected: string) => { if (take() !== expected) fail('unsupported-syntax'); };
  const sections = new Map<string, readonly ArduinoInstruction[]>();
  while (cursor < tokens.length) {
    expect('void');
    const section = take();
    if ((section !== 'setup' && section !== 'loop') || sections.has(section)) return fail('unsupported-syntax');
    expect('('); expect(')'); expect('{');
    const instructions: ArduinoInstruction[] = [];
    while (tokens[cursor] !== '}') {
      const call = take();
      if (call !== 'pinMode' && call !== 'digitalWrite' && call !== 'delay') return fail('unsupported-syntax');
      expect('(');
      let instruction: ArduinoInstruction;
      if (call === 'delay') {
        instruction = { type: 'delay', milliseconds: decimal(take(), MAX_DELAY_MS) };
      } else {
        const pinId = resolvePin(take(), board);
        expect(',');
        const value = take();
        if (call === 'pinMode') {
          if (value !== 'INPUT' && value !== 'OUTPUT') return fail('invalid-value');
          instruction = { type: 'pinMode', pinId, mode: value === 'OUTPUT' ? 'output' : 'input' };
        } else {
          if (value !== 'HIGH' && value !== 'LOW') return fail('invalid-value');
          instruction = { type: 'digitalWrite', pinId, level: value };
        }
      }
      expect(')'); expect(';');
      instructions.push(instruction);
      count++;
      if (count > MAX_PROGRAM_INSTRUCTIONS) return fail('instruction-limit');
    }
    expect('}');
    sections.set(section, instructions);
  }
  const setup = sections.get('setup'), loop = sections.get('loop');
  if (!setup || !loop) return fail('unsupported-syntax');
  return { board, setup, loop };
}
export function createArduinoExecution(source: string, board: BoardKind = 'arduino-uno'): UnoExecution {
  const program = compileArduinoSubset(source, board);
  return { board, program, timeMs: 0, phase: 'setup', pc: 0, wakeAt: null, modes: {}, levels: {} };
}
/** Advance a bounded virtual time delta, returning GPIO events in instruction/time order. */
export function advanceArduino(previous: UnoExecution, elapsedMs: number): UnoAdvanceResult {
  if (!Number.isSafeInteger(elapsedMs) || elapsedMs < 0 || !Number.isSafeInteger(previous.timeMs + elapsedMs)) return fail('invalid-value');
  const target = previous.timeMs + elapsedMs;
  let timeMs = previous.timeMs, phase = previous.phase, pc = previous.pc, wakeAt = previous.wakeAt;
  const modes = { ...previous.modes }, levels = { ...previous.levels };
  const gpio: UnoGpioEvent[] = [];
  let steps = 0;
  for (;;) {
    if (wakeAt !== null) {
      if (wakeAt > target) return { execution: { ...previous, timeMs: target, phase, pc, wakeAt, modes, levels }, gpio };
      timeMs = wakeAt;
      wakeAt = null;
    }
    if (++steps > MAX_ADVANCE_STEPS) return fail('step-limit');
    const instructions = previous.program[phase];
    const instruction = instructions[pc];
    if (!instruction) {
      phase = 'loop';
      pc = 0;
      continue;
    }
    pc++;
    if (instruction.type === 'delay') {
      if (!Number.isSafeInteger(timeMs + instruction.milliseconds)) return fail('invalid-value');
      wakeAt = timeMs + instruction.milliseconds;
    } else if (instruction.type === 'pinMode') {
      modes[instruction.pinId] = instruction.mode;
      // UNO INPUT disables its pull-up by clearing the AVR output latch.
      if (instruction.mode === 'input' && previous.board === 'arduino-uno') levels[instruction.pinId] = 'LOW';
      gpio.push({ atMs: timeMs, pinId: instruction.pinId, state: { mode: instruction.mode,
        level: instruction.mode === 'input' ? 'FLOATING' : levels[instruction.pinId] ?? 'LOW' } });
    } else {
      if (modes[instruction.pinId] !== 'output') return fail('pin-not-output');
      levels[instruction.pinId] = instruction.level;
      gpio.push({ atMs: timeMs, pinId: instruction.pinId, state: { mode: 'output', level: instruction.level } });
    }
  }
}
// Backward-compatible names for the initial UNO-only integration; profile stays explicit in state.
export { compileArduinoSubset as compileUno, createArduinoExecution as createUnoExecution, advanceArduino as advanceUno };
