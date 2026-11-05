import { describe, expect, it } from 'vitest';
import { advanceArduino, compileArduinoSubset, createArduinoExecution, MAX_PROGRAM_INSTRUCTIONS, MAX_SOURCE_LENGTH, UnoExecutionError } from './uno';

const blink = (pin = '13', wait = 1000) => `#include <Arduino.h>
// This source is parsed, never native-executed.
void setup() { pinMode(${pin}, OUTPUT); }
void loop() { digitalWrite(${pin}, HIGH); delay(${wait}); digitalWrite(${pin}, LOW); delay(${wait}); }`;
function errorCode(action: () => unknown): string {
  try { action(); } catch (error) { if (error instanceof UnoExecutionError) return error.code; throw error; }
  throw new Error('expected typed error');
}
describe('bounded direct-GPIO Arduino source subset', () => {
  it('runs setup and source-defined UNO pin13 blink at exact 0/1000/2000ms boundaries', () => {
    const initial = createArduinoExecution(blink());
    const first = advanceArduino(initial, 0);
    expect(first.gpio).toEqual([
      { atMs: 0, pinId: 'D13', state: { mode: 'output', level: 'LOW' } },
      { atMs: 0, pinId: 'D13', state: { mode: 'output', level: 'HIGH' } },
    ]);
    expect(initial.pc).toBe(0);
    const before = advanceArduino(first.execution, 999);
    expect(before.gpio).toEqual([]);
    const low = advanceArduino(before.execution, 1);
    expect(low.gpio).toEqual([{ atMs: 1000, pinId: 'D13', state: { mode: 'output', level: 'LOW' } }]);
    const high = advanceArduino(low.execution, 1000);
    expect(high.gpio).toEqual([{ atMs: 2000, pinId: 'D13', state: { mode: 'output', level: 'HIGH' } }]);
  });
  it('source changes determine the driven pin and delay period', () => {
    const result = advanceArduino(createArduinoExecution(blink('12', 250)), 500);
    expect(result.gpio.filter((event) => event.state.level === 'HIGH').map((event) => [event.pinId, event.atMs])).toEqual([['D12', 0], ['D12', 500]]);
    expect(result.gpio.some((event) => event.pinId === 'D13')).toBe(false);
  });
  it('gives identical state and chronological events across different time chunks', () => {
    const initial = createArduinoExecution(blink());
    const complete = advanceArduino(initial, 4000);
    let state = initial;
    const events = [];
    for (const delta of [0, 250, 750, 1300, 1700]) {
      const result = advanceArduino(state, delta);
      state = result.execution;
      events.push(...result.gpio);
    }
    expect(state).toEqual(complete.execution);
    expect(events).toEqual(complete.gpio);
  });
  it('resolves UNO built-in and analog-capable digital pins from the profile', () => {
    expect(compileArduinoSubset(blink('LED_BUILTIN')).setup[0]).toMatchObject({ pinId: 'D13' });
    expect(compileArduinoSubset(blink('14')).setup[0]).toMatchObject({ pinId: 'A0' });
    expect(compileArduinoSubset(blink('A5')).setup[0]).toMatchObject({ pinId: 'A5' });
  });
  it('resolves NodeMCU symbols and numeric ESP GPIO independently of UNO', () => {
    expect(compileArduinoSubset(blink('D1'), 'esp8266').setup[0]).toMatchObject({ pinId: 'D1' });
    expect(compileArduinoSubset(blink('5'), 'esp8266').setup[0]).toMatchObject({ pinId: 'D1' });
    expect(compileArduinoSubset(blink('13'), 'esp8266').setup[0]).toMatchObject({ pinId: 'D7' });
    expect(compileArduinoSubset(blink('LED_BUILTIN'), 'esp8266').setup[0]).toMatchObject({ pinId: 'D4' });
    const result = advanceArduino(createArduinoExecution(blink('D0', 100), 'esp8266'), 100);
    expect(result.execution.board).toBe('esp8266');
    expect(result.gpio.at(-1)).toMatchObject({ pinId: 'D0', atMs: 100, state: { level: 'LOW' } });
  });
  it('keeps separate board executions independent', () => {
    const uno = createArduinoExecution(blink('13', 1000));
    const esp = createArduinoExecution(blink('D1', 250), 'esp8266');
    const a = advanceArduino(uno, 1000), b = advanceArduino(esp, 1000);
    expect(a.gpio).toHaveLength(3);
    expect(b.gpio).toHaveLength(6);
    expect(a.execution.program).not.toBe(b.execution.program);
    expect(uno.timeMs).toBe(0);
    expect(esp.timeMs).toBe(0);
  });
  it('supports input high impedance but rejects digitalWrite on non-output pins', () => {
    const result = advanceArduino(createArduinoExecution('void setup(){pinMode(13, INPUT);}void loop(){delay(1000);}'), 0);
    expect(result.gpio[0]?.state).toEqual({ mode: 'input', level: 'FLOATING' });
    expect(errorCode(() => advanceArduino(createArduinoExecution('void setup(){}void loop(){digitalWrite(13,HIGH);delay(1000);}'), 0))).toBe('pin-not-output');
  });
  it('returns to a LOW output latch after INPUT disables pull-up', () => {
    const result = advanceArduino(createArduinoExecution('void setup(){pinMode(13,OUTPUT);digitalWrite(13,HIGH);pinMode(13,INPUT);pinMode(13,OUTPUT);}void loop(){delay(1000);}'), 0);
    expect(result.gpio.at(-2)?.state).toEqual({ mode: 'input', level: 'FLOATING' });
    expect(result.gpio.at(-1)?.state).toEqual({ mode: 'output', level: 'LOW' });
  });
  it.each([
    'void setup(){}', 'void setup(){}void loop(){ unknown(13); }',
    'void setup(){}void loop(){while(true){digitalWrite(13,HIGH);}}',
    'int pin=13;void setup(){}void loop(){delay(1000);}',
    '#include <ESP8266WiFi.h>\nvoid setup(){}void loop(){delay(1000);}',
    'void setup(){}void loop(){WiFi.begin();delay(1000);}',
    'void setup(){}void loop(){Serial.println("x");delay(1000);}',
    'void setup(){}void loop(){delay(1000)}',
    'void setup(){}void setup(){}void loop(){}',
    '/* unclosed void setup(){}void loop(){}',
    '// /*\nWiFi.begin();\n// */\nvoid setup(){}void loop(){delay(1000);}',
    'void setup(){\n#include <Arduino.h>\n}void loop(){delay(1000);}',
  ])('explicitly rejects unsupported or malformed C++: %s', (source) => {
    expect(() => compileArduinoSubset(source)).toThrow(UnoExecutionError);
  });
  it('rejects invalid pins, non-decimal values, delay values and unsupported modes', () => {
    for (const source of [blink('20'), blink('013'), blink('D13'), blink('D99'), blink('13', -1), blink('13', 86400001),
      'void setup(){pinMode(13,INPUT_PULLUP);}void loop(){delay(1000);}']) expect(() => compileArduinoSubset(source)).toThrow(UnoExecutionError);
    expect(() => compileArduinoSubset(blink('6'), 'esp8266')).toThrow(UnoExecutionError);
  });
  it('bounds zero-delay loops, empty loops, source size, operations, and excessive time advances', () => {
    for (const source of ['void setup(){}void loop(){}', 'void setup(){}void loop(){delay(0);}'])
      expect(errorCode(() => advanceArduino(createArduinoExecution(source), 0))).toBe('step-limit');
    expect(errorCode(() => compileArduinoSubset(' '.repeat(MAX_SOURCE_LENGTH + 1)))).toBe('source-limit');
    expect(errorCode(() => compileArduinoSubset(`void setup(){}void loop(){${'delay(1);'.repeat(MAX_PROGRAM_INSTRUCTIONS + 1)}}`))).toBe('instruction-limit');
    expect(errorCode(() => advanceArduino(createArduinoExecution(blink('13', 1)), 100000))).toBe('step-limit');
    expect(errorCode(() => advanceArduino(createArduinoExecution(blink()), -1))).toBe('invalid-value');
  });
  it('accepts comments, whitespace and Arduino header without treating comments as instructions', () => {
    const source = '/*digitalWrite(99,HIGH);*/\n#include<Arduino.h>\nvoid loop(){ delay(1000); } void setup(){ // mode\n pinMode(13,OUTPUT); }';
    expect(advanceArduino(createArduinoExecution(source), 0).gpio).toEqual([{ atMs: 0, pinId: 'D13', state: { mode: 'output', level: 'LOW' } }]);
  });
});
