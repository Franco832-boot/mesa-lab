import type { LcdController } from '../model/lcd';
import { writeLcdNibble } from './hd44780';

/** YWROBOT mapping: P0=RS, P1=RW, P2=E, P3=backlight, P4..P7=D4..D7. */
export function pcfLcdByte(state: LcdController, previousLatch: number, latch: number): LcdController {
  return (previousLatch & 4) !== 0 && (latch & 4) === 0 && (latch & 2) === 0
    ? writeLcdNibble(state, (latch & 1) !== 0, latch >> 4) : state;
}
export function pcfLcdPulses(byte: number, data: boolean, backlight: boolean): readonly number[] {
  const flags = (data ? 1 : 0) | (backlight ? 8 : 0);
  return [byte & 0xf0, (byte << 4) & 0xf0].flatMap((nibble) => [nibble | flags, nibble | flags | 4, nibble | flags]);
}
