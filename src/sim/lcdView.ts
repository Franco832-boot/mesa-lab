import { lcdGeometry, lcdRowOffsets } from '../model/lcd';
import type { LcdController, LcdKind, LcdView } from '../model/lcd';
import { initialLcd, lcdLines } from './hd44780';

export function lcdView(kind: LcdKind, state: LcdController | undefined,
  voltage: (terminal: string) => number | undefined, backlightCurrent: number | undefined): LcdView {
  const controller = state ?? initialLcd(), geometry = lcdGeometry(kind);
  const supply = voltage('VDD'), vo = voltage('VO');
  const powered = supply !== undefined && supply >= 4.5 - 1e-8 && supply <= 5.5 + 1e-8;
  const contrast = powered && vo !== undefined && supply !== undefined && vo >= -1e-8 && vo <= supply + 1e-8 ? Math.max(0, Math.min(1, 1 - (vo / supply) * 5)) : 0;
  const display = powered && controller.initialized && controller.display;
  const cursorRow = lcdRowOffsets(geometry.columns).slice(0, geometry.rows)
    .findIndex((offset) => controller.address >= offset && controller.address < offset + geometry.columns);
  return { ...geometry, powered, contrast, display, backlight: Math.max(0, Math.min(1, (backlightCurrent ?? 0) / 0.02)),
    lines: display && contrast > 0 ? lcdLines(controller, geometry) : Array.from({ length: geometry.rows }, () => ' '.repeat(geometry.columns)),
    cursor: display && controller.cursor, blink: display && controller.blink, cursorRow,
    cursorColumn: controller.address - (lcdRowOffsets(geometry.columns)[cursorRow] ?? 0), connection: controller.connection };
}
