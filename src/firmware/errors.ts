import type { SerialState } from './serial';
export const MAX_SOURCE_LENGTH = 32768;
export const MAX_PROGRAM_INSTRUCTIONS = 512;
export const MAX_ADVANCE_STEPS = 4096;
export const MAX_DELAY_MS = 86400000;
export const MAX_NESTING = 32;
export const MAX_AST_NODES = 4096;

export interface SourceSpan {
  file?: string;
  offset: number;
  line: number;
  column: number;
}
export type UnoErrorCode = 'unsupported-syntax' | 'invalid-value' | 'source-limit' | 'instruction-limit' | 'step-limit' | 'pin-not-output'
  | 'wifi-disconnected' | 'indeterminate-read' | 'missing-file' | 'include-cycle' | 'http-handler-limit' | 'name-error' | 'type-error' | 'arithmetic-error' | 'nesting-limit';
export class UnoExecutionError extends Error {
  serial: SerialState | null = null;
  constructor(readonly code: UnoErrorCode, readonly location: SourceSpan | null = null) {
    super(code);
    this.name = 'UnoExecutionError';
  }
}
export function fail(code: UnoErrorCode, location: SourceSpan | null = null): never {
  throw new UnoExecutionError(code, location);
}
