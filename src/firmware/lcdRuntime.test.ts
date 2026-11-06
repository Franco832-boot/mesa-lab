import { describe, expect, it } from 'vitest';
import { advanceArduino, compileArduinoSubset, createArduinoExecution, UnoExecutionError } from './uno';
import type { UnoExecution } from './uno';
import type { FirmwareHost } from './ports';
import type { LcdOperation } from '../model/lcd';

function complete(execution: UnoExecution, host: FirmwareHost, budget: number) {
  let result = advanceArduino(execution, 0, budget, host), slices = 1;
  while (result.yielded) {
    if (++slices > 10000) throw new Error('Unexpected non-terminating advance');
    result = advanceArduino(result.execution, 0, budget, host);
  }
  return { execution: result.execution, slices };
}
describe('typed and resumable LCD library adapters', () => {
  it('bounds long literal writes and produces the same operation trace one instruction at a time', () => {
    const text = 'abcdefghijklmnop'.repeat(80);
    const source = `#include <LiquidCrystal.h>\nLiquidCrystal arbitraryName(12,11,5,4,3,2);void setup(){arbitraryName.begin(16,2);arbitraryName.print("${text}");arbitraryName.write('A');}void loop(){delay(1000);}`;
    const whole: LcdOperation[] = [], sliced: LcdOperation[] = [];
    const host = (trace: LcdOperation[]): FirmwareHost => ({ observeDht: () => null, writeLcd: (_bus, operation) => { trace.push(operation); } });
    const ordinary = complete(createArduinoExecution(source), host(whole), 4096);
    const incremental = complete(createArduinoExecution(source), host(sliced), 1);
    expect(ordinary.slices).toBeGreaterThan(1);
    expect(incremental.execution).toEqual(ordinary.execution);
    expect(sliced).toEqual(whole);
    expect(whole.filter((op) => op.kind === 'print').map((op) => op.kind === 'print' ? op.text : '').join('')).toBe(text + 'A');
    expect(whole.every((op) => op.kind !== 'print' || op.text.length <= 32)).toBe(true);
  });
  it('accepts hexadecimal address constants and init() without an explicit Wire.begin()', () => {
    const source = '#include <LiquidCrystal_I2C.h>\n#define ADDRESS 0x3F\nLiquidCrystal_I2C lcd(ADDRESS,20,4);void setup(){lcd.init();lcd.backlight();}void loop(){delay(1000);}';
    const result = advanceArduino(createArduinoExecution(source), 0);
    expect(result.execution.modes.A4).toBe('input'); expect(result.execution.modes.A5).toBe('input');
  });
  it.each([
    'LiquidCrystal lcd(12,11,5,4,3,2);void setup(){}void loop(){}',
    'void setup(){Wire.begin();}void loop(){}',
    '#include <LiquidCrystal.h>\nLiquidCrystal lcd(12,11,5,4,3,2);void setup(){lcd.begin(16,2);lcd.createChar(0,0);}void loop(){}',
    '#include <LiquidCrystal.h>\nLiquidCrystal lcd(12,11,5,4,3,2);void setup(){int n=lcd.print("x");}void loop(){}',
    '#include <LiquidCrystal.h>\nLiquidCrystal lcd(12,11,5,4,3,2);void setup(){lcd.begin(16,2);lcd.setCursor(0,4);}void loop(){}',
  ])('rejects unsupported or invalid contracts without native execution: %s', (source) => {
    expect(() => complete(createArduinoExecution(source), { observeDht: () => null }, 4096)).toThrow(UnoExecutionError);
  });
  it('keeps existing octal rejection and diagnoses an invalid I²C address', () => {
    expect(() => compileArduinoSubset('void setup(){pinMode(013,OUTPUT);}void loop(){}')).toThrow();
    const source = '#include <LiquidCrystal_I2C.h>\nLiquidCrystal_I2C lcd(0x50,16,2);void setup(){}void loop(){}';
    expect(() => advanceArduino(createArduinoExecution(source), 0)).toThrow(UnoExecutionError);
  });
});
