import type { BoardKind, GpioState } from '../model/types';
import type { ValueType } from './ast';
import type { UnoProgram } from './compiler';
import { fail, MAX_ADVANCE_STEPS, MAX_AST_NODES } from './errors';
import type { SourceSpan } from './errors';
import { builtinEffect } from './profile';
import { binary, convert, unary } from './values';
import type { Value } from './values';
import { CLOCK_BUILTINS } from './builtins';

/** A polling loop runs once per virtual millisecond. This is not CPU cycle timing. */
export const LOOP_QUANTUM_US = 1000;
export interface Variable { type: ValueType; constant: boolean; value: Value | null }
export interface UnoExecution {
  program: UnoProgram;
  board: BoardKind;
  timeUs: number;
  /** Derived compatibility projections; microseconds are authoritative. */
  timeMs: number;
  phase: 'setup' | 'loop';
  pc: number;
  wakeAtUs: number | null;
  wakeReason: 'delay' | 'cooperative' | null;
  wakeAt: number | null;
  pendingUntilUs: number | null;
  loopWaited: boolean;
  scopes: readonly ReadonlyMap<string, Variable>[];
  operands: readonly Value[];
  modes: Readonly<Record<string, 'input' | 'output'>>;
  levels: Readonly<Record<string, 'HIGH' | 'LOW'>>;
}
export interface UnoGpioEvent { atMs: number; pinId: string; state: GpioState }
export interface UnoAdvanceResult {
  execution: UnoExecution;
  gpio: readonly UnoGpioEvent[];
  yielded: boolean;
  steps: number;
}
export function initialExecution(program: UnoProgram): UnoExecution {
  return { program, board: program.board, timeUs: 0, timeMs: 0, phase: 'setup', pc: 0,
    wakeAtUs: null, wakeReason: null, wakeAt: null, pendingUntilUs: null, loopWaited: false,
    scopes: [new Map()], operands: [], modes: {}, levels: {} };
}

/** Bounded VM: even expression evaluation suspends at individual instructions. */
export function advanceArduinoMicros(previous: UnoExecution, elapsedUs: number, budget = MAX_ADVANCE_STEPS): UnoAdvanceResult {
  const target = (previous.pendingUntilUs ?? previous.timeUs) + elapsedUs;
  if (!Number.isSafeInteger(elapsedUs) || elapsedUs < 0 || !Number.isSafeInteger(target)
    || !Number.isInteger(budget) || budget < 1 || budget > MAX_ADVANCE_STEPS) return fail('invalid-value');
  let timeUs = previous.timeUs, phase = previous.phase, pc = previous.pc, wakeAtUs = previous.wakeAtUs, loopWaited = previous.loopWaited;
  let wakeReason = previous.wakeReason;
  const scopes = previous.scopes.map((scope) => new Map(scope));
  const operands = [...previous.operands], modes = { ...previous.modes }, levels = { ...previous.levels };
  const gpio: UnoGpioEvent[] = [];
  let steps = 0;
  const finish = (yielded: boolean): UnoAdvanceResult => ({
    execution: { ...previous, timeUs, timeMs: timeUs / 1000, phase, pc, wakeAtUs, wakeReason, wakeAt: wakeAtUs === null ? null : wakeAtUs / 1000,
      pendingUntilUs: yielded ? target : null, loopWaited, scopes, operands, modes, levels },
    gpio, yielded, steps,
  });
  const pop = (at: SourceSpan): Value => operands.pop() ?? fail('type-error', at);
  const locate = (name: string, at: SourceSpan): { scope: Map<string, Variable>; variable: Variable } => {
    for (let i = scopes.length - 1; i >= 0; i--) {
      const scope = scopes[i], variable = scope?.get(name);
      if (scope && variable) return { scope, variable };
    }
    return fail('name-error', at);
  };
  const read = (variable: Variable, at: SourceSpan): Value => variable.value ?? fail('type-error', at);
  const save = (name: string, value: Value, at: SourceSpan): Value => {
    const { scope, variable } = locate(name, at);
    if (variable.constant) return fail('type-error', at);
    const converted = convert(value.value, variable.type, previous.board, at);
    scope.set(name, { ...variable, value: converted }); return converted;
  };
  for (;;) {
    if (wakeAtUs !== null) {
      if (wakeAtUs > target) { timeUs = target; return finish(false); }
      timeUs = wakeAtUs; wakeAtUs = null; wakeReason = null;
    }
    if (steps >= budget) return finish(true);
    const instruction = previous.program.code[pc++];
    if (!instruction) return fail('unsupported-syntax');
    const at = instruction.at;
    steps++;
    switch (instruction.op) {
      case 'push': operands.push(instruction.value); break;
      case 'load': operands.push(read(locate(instruction.name, at).variable, at)); break;
      case 'clock': operands.push({ type: 'unsigned long', value: Math.floor(timeUs / CLOCK_BUILTINS[instruction.name].divisorUs) % 0x1_0000_0000 }); break;
      case 'drop': pop(at); break;
      case 'boolean': operands.push({ type: 'bool', value: Number(pop(at).value !== 0) }); break;
      case 'unary': operands.push(unary(instruction.operator, pop(at), previous.board, at)); break;
      case 'binary': {
        const b = pop(at), a = pop(at);
        operands.push(binary(instruction.operator, a, b, previous.board, at)); break;
      }
      case 'declare': {
        const value = instruction.initialized ? convert(pop(at).value, instruction.valueType, previous.board, at)
          : instruction.global ? convert(0, instruction.valueType, previous.board, at) : null;
        const scope = scopes.at(-1) ?? fail('type-error', at);
        if (scope.has(instruction.name)) return fail('name-error', at);
        scope.set(instruction.name, { type: instruction.valueType, constant: instruction.constant, value }); break;
      }
      case 'store': {
        let value = pop(at);
        if (instruction.compound) value = binary(instruction.compound, read(locate(instruction.name, at).variable, at), value, previous.board, at);
        operands.push(save(instruction.name, value, at)); break;
      }
      case 'update': {
        const before = read(locate(instruction.name, at).variable, at);
        const after = save(instruction.name, binary('+', before, { type: 'int', value: instruction.delta }, previous.board, at), at);
        operands.push(instruction.prefix ? after : before); break;
      }
      case 'jump': pc = instruction.target; break;
      case 'branch': if ((pop(at).value !== 0) === instruction.when) pc = instruction.target; break;
      case 'enter': scopes.push(new Map()); break;
      case 'leave': if (scopes.length < 2) return fail('type-error', at); scopes.pop(); break;
      case 'start-loop': phase = 'loop'; loopWaited = false; break;
      case 'repeat':
        pc = previous.program.loopPc;
        if (!loopWaited) { wakeAtUs = timeUs + LOOP_QUANTUM_US; wakeReason = 'cooperative'; }
        loopWaited = false;
        if (wakeAtUs !== null && !Number.isSafeInteger(wakeAtUs)) return fail('invalid-value', at);
        break;
      case 'call': {
        const args = operands.splice(operands.length - instruction.arity, instruction.arity);
        const effect = builtinEffect(instruction.name, args, previous.board, at);
        if (effect.kind === 'wait') {
          wakeAtUs = timeUs + effect.microseconds;
          wakeReason = 'delay';
          if (!Number.isSafeInteger(wakeAtUs)) return fail('invalid-value', at);
          if (phase === 'loop' && effect.microseconds > 0) loopWaited = true;
        } else if (effect.kind === 'mode') {
          modes[effect.pinId] = effect.mode;
          if (effect.mode === 'input' && previous.board === 'arduino-uno') levels[effect.pinId] = 'LOW';
          gpio.push({ atMs: timeUs / 1000, pinId: effect.pinId, state: { mode: effect.mode,
            level: effect.mode === 'input' ? 'FLOATING' : levels[effect.pinId] ?? 'LOW' } });
        } else {
          if (modes[effect.pinId] !== 'output') return fail('pin-not-output', at);
          levels[effect.pinId] = effect.level;
          gpio.push({ atMs: timeUs / 1000, pinId: effect.pinId, state: { mode: 'output', level: effect.level } });
        }
        break;
      }
    }
    if (operands.length > MAX_AST_NODES) return fail('step-limit', at);
  }
}

export function advanceArduino(previous: UnoExecution, elapsedMs: number, budget = MAX_ADVANCE_STEPS): UnoAdvanceResult {
  const scaled = elapsedMs * 1000, microseconds = Math.round(scaled);
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || Math.abs(scaled - microseconds) > 0.000001) return fail('invalid-value');
  return advanceArduinoMicros(previous, microseconds, budget);
}
