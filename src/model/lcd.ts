export const LCD_TERMINALS = ['VSS', 'VDD', 'VO', 'RS', 'RW', 'E', 'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'A', 'K'] as const;
export const LCD_CONTROL_TERMINALS = ['RS', 'E', 'D4', 'D5', 'D6', 'D7'] as const;
export interface LcdGeometry { columns: number; rows: number }
export type LcdKind = 'lcd-16x2' | 'lcd-20x4';
export function isLcdKind(kind: string): kind is LcdKind { return kind === 'lcd-16x2' || kind === 'lcd-20x4'; }
export function lcdGeometry(kind: LcdKind): LcdGeometry { return kind === 'lcd-16x2' ? { columns: 16, rows: 2 } : { columns: 20, rows: 4 }; }
export function lcdWindow(kind: LcdKind) { return kind === 'lcd-16x2' ? { x: 7.75, y: 10, width: 64.5, height: 16 } : { x: 11, y: 16, width: 76, height: 25.2 }; }
export type LcdBus = (LcdGeometry & { kind: 'parallel'; pins: readonly string[] })
  | (LcdGeometry & { kind: 'i2c'; address: number });
export type LcdOperation = { kind: 'init' | 'clear' | 'home' }
  | { kind: 'position'; column: number; row: number }
  | { kind: 'print'; text: string }
  | { kind: 'flag'; flag: 'display' | 'cursor' | 'blink' | 'backlight'; enabled: boolean };
export interface LcdController {
  memory: readonly number[];
  address: number;
  display: boolean;
  cursor: boolean;
  blink: boolean;
  initialized: boolean;
  pending: { nibble: number; data: boolean } | null;
  connection: 'parallel' | 'i2c' | 'none';
}
export interface LcdView extends LcdGeometry {
  lines: readonly string[];
  powered: boolean;
  backlight: number;
  contrast: number;
  display: boolean;
  cursor: boolean;
  blink: boolean;
  cursorColumn: number;
  cursorRow: number;
  connection: LcdController['connection'];
}
export function lcdRowOffsets(columns: number): readonly number[] { return [0, 0x40, columns, 0x40 + columns]; }
export function validPcfAddress(address: number): boolean {
  return Number.isInteger(address) && ((address >= 0x20 && address <= 0x27) || (address >= 0x38 && address <= 0x3f));
}
export function validLcdController(state: LcdController): boolean {
  return state.memory.length === 80 && state.memory.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
    && Number.isInteger(state.address) && state.address >= 0 && state.address < 128
    && [state.display, state.cursor, state.blink, state.initialized].every((flag) => typeof flag === 'boolean')
    && ['none', 'parallel', 'i2c'].includes(state.connection)
    && (state.pending === null || (typeof state.pending.data === 'boolean' && Number.isInteger(state.pending.nibble) && state.pending.nibble >= 0 && state.pending.nibble <= 15));
}
