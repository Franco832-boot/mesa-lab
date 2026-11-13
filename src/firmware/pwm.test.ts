import { describe, expect, it } from 'vitest';
import { advanceArduino, createArduinoExecution } from './uno';

const run = (source: string) => advanceArduino(createArduinoExecution(`void setup(){${source}}void loop(){delay(10000);}`), 0);
describe('UNO analogWrite peripheral contract', () => {
  it.each([3, 5, 6, 9, 10, 11])('configures pin %i as output with the default timer period', (pin) => {
    const result = run(`analogWrite(${pin},128);`);
    expect(result.gpio.at(-1)?.state).toEqual({ mode: 'output', level: 'HIGH', pwm: { value: 128, periodUs: pin === 5 || pin === 6 ? 1024 : 2040 } });
    expect(result.execution.modes[`D${pin}`]).toBe('output');
  });
  it('handles endpoints and the AVR digital fallback on non-PWM pins', () => {
    for (const [pin, value, level] of [[9, 0, 'LOW'], [9, 255, 'HIGH'], [2, 127, 'LOW'], [2, 128, 'HIGH']] as const)
      expect(run(`analogWrite(${pin},${value});`).gpio.at(-1)?.state).toEqual({ mode: 'output', level });
  });
  it('digitalWrite and pinMode cancel PWM, preserving ordinary GPIO behavior', () => {
    expect(run('analogWrite(9,64);digitalWrite(9,LOW);').gpio.at(-1)?.state).toEqual({ mode: 'output', level: 'LOW' });
    expect(run('analogWrite(9,64);pinMode(9,INPUT);').gpio.at(-1)?.state).toEqual({ mode: 'input', level: 'FLOATING' });
  });
  it.each([-1, 256, 1.5])('rejects invalid duty %s', (value) => expect(() => run(`analogWrite(9,${value});`)).toThrow());
  it('does not silently claim ESP PWM support', () => {
    expect(() => createArduinoExecution('void setup(){analogWrite(D5,128);}void loop(){}', 'esp8266')).toThrow();
  });
});
