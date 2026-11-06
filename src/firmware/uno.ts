import type { BoardKind } from '../model/types';
import { compileArduinoSubset } from './compiler';
import { initialExecution } from './machine';
import type { UnoExecution } from './machine';

export { compileArduinoSubset, compileArduinoSubset as compileUno } from './compiler';
export type { UnoProgram } from './compiler';
export {
  advanceArduino,
  advanceArduino as advanceUno,
  advanceArduinoMicros,
  LOOP_QUANTUM_US,
} from './machine';
export type { UnoExecution, UnoGpioEvent, UnoAdvanceResult } from './machine';
export {
  MAX_SOURCE_LENGTH,
  MAX_PROGRAM_INSTRUCTIONS,
  MAX_ADVANCE_STEPS,
  MAX_DELAY_MS,
  UnoExecutionError,
} from './errors';
export type { UnoErrorCode } from './errors';

/** Compatibility facade; all execution state remains transient and board-specific. */
export function createArduinoExecution(
  source: string,
  board: BoardKind = 'arduino-uno',
): UnoExecution {
  return initialExecution(compileArduinoSubset(source, board));
}
export { createArduinoExecution as createUnoExecution };
