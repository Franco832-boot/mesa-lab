import type { LcdController, LcdGeometry, LcdOperation } from '../model/lcd';
import { lcdRowOffsets } from '../model/lcd';

export function initialLcd(): LcdController {
  return { memory: Array.from({ length: 80 }, () => 32), address: 0, display: false, cursor: false,
    blink: false, initialized: false, pending: null, connection: 'none' };
}
function memoryIndex(address: number): number | null {
  return address >= 0 && address < 40 ? address : address >= 0x40 && address < 0x68 ? 40 + address - 0x40 : null;
}
/** Shared HD44780 instruction/data registers and 80-byte DDRAM. */
export function writeLcdByte(previous: LcdController, data: boolean, byte: number): LcdController {
  const state = { ...previous, pending: null };
  if (data) {
    const index = memoryIndex(state.address), memory = [...state.memory];
    if (index !== null) memory[index] = byte & 255;
    return { ...state, memory, address: state.address === 39 ? 0x40 : state.address === 0x67 ? 0 : (state.address + 1) & 127 };
  }
  if (byte === 1) return { ...state, memory: Array.from({ length: 80 }, () => 32), address: 0 };
  if (byte === 2) return { ...state, address: 0 };
  if ((byte & 0x80) !== 0) return { ...state, address: byte & 127 };
  if ((byte & 0xf8) === 8) return { ...state, display: (byte & 4) !== 0, cursor: (byte & 2) !== 0, blink: (byte & 1) !== 0 };
  if ((byte & 0xe0) === 0x20) return { ...state, initialized: true };
  return state;
}
export function writeLcdNibble(state: LcdController, data: boolean, nibble: number): LcdController {
  if (!state.pending || state.pending.data !== data) return { ...state, pending: { data, nibble: nibble & 15 } };
  return writeLcdByte(state, data, (state.pending.nibble << 4) | (nibble & 15));
}
export function lcdCharacter(byte: number): string {
  return byte === 223 ? '°' : byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '□';
}
export function lcdLines(state: LcdController, geometry: LcdGeometry): string[] {
  return lcdRowOffsets(geometry.columns).slice(0, geometry.rows).map((offset) =>
    Array.from({ length: geometry.columns }, (_, column) => lcdCharacter(state.memory[memoryIndex(offset + column) ?? -1] ?? 32)).join(''));
}
/** API operations encode the same instruction/data bytes for every transport. */
export function lcdOperationBytes(state: LcdController, geometry: LcdGeometry, operation: LcdOperation): readonly { data: boolean; byte: number }[] {
  const command = (byte: number) => ({ data: false, byte });
  switch (operation.kind) {
    case 'init': return [0x28, 0x0c, 1, 6].map(command);
    case 'clear': return [command(1)];
    case 'home': return [command(2)];
    case 'position': return [command(0x80 | ((lcdRowOffsets(geometry.columns)[operation.row] ?? 0) + operation.column))];
    case 'print': return Array.from(operation.text, (character) => ({ data: true, byte: character.charCodeAt(0) <= 255 ? character.charCodeAt(0) : 0 }));
    case 'flag': {
      if (operation.flag === 'backlight') return [];
      const flags = { display: state.display, cursor: state.cursor, blink: state.blink, [operation.flag]: operation.enabled };
      return [command(8 | (flags.display ? 4 : 0) | (flags.cursor ? 2 : 0) | (flags.blink ? 1 : 0))];
    }
  }
}
