import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { advanceArduino, compileArduinoSubset, createArduinoExecution } from './uno';
import type { UnoExecution } from './uno';

const source = readFileSync(new URL('../../examples/arduino/led-for.ino', import.meta.url), 'utf8');
function complete(execution: UnoExecution, elapsed: number, budget = 4096) {
  let result = advanceArduino(execution, elapsed, budget);
  const gpio = [...result.gpio];
  for (let count = 0; result.yielded; count++) {
    if (count > 100000) throw new Error('Execution did not finish its time slice');
    result = advanceArduino(result.execution, 0, budget); gpio.push(...result.gpio);
  }
  return { ...result, gpio };
}
describe('resumable for statements', () => {
  it('executes three exact HIGH/LOW pulses, waits 1500 ms and starts the next sequence', () => {
    const trace = complete(createArduinoExecution(source), 3300).gpio;
    expect(trace.map((event) => [event.atMs, event.state.level])).toEqual([
      [0,'LOW'],[0,'HIGH'],[300,'LOW'],[600,'HIGH'],[900,'LOW'],[1200,'HIGH'],[1500,'LOW'],[3300,'HIGH'],
    ]);
    expect(complete(createArduinoExecution(source), 3300, 1).gpio).toEqual(trace);
  });
  it('supports nested loops, expression initializers and empty clauses, with correct scope and return cleanup', () => {
    const sketch = `int total=0;int i=0;void setup(){
      for(i=0;i<2;i++){for(int j=0;j<3;++j){total+=1;}}
      for(;i<4;){i++;}for(int j=4;j<4;j++){total+=100;}
      for(;;){return;}}
      void loop(){delay(1000);}`;
    const result = complete(createArduinoExecution(sketch), 0).execution;
    expect(result.scopes[0]?.get('total')?.value?.value).toBe(6);
    expect(result.scopes[0]?.get('i')?.value?.value).toBe(4);
    expect(result.scopes.some((scope) => scope.has('j'))).toBe(false);
    expect(result.scopes).toHaveLength(2);
  });
  it('yields finite instruction budgets for infinite loops and keeps the prior snapshot immutable', () => {
    const initial = createArduinoExecution('void setup(){}void loop(){for(;;){}}');
    const first = advanceArduino(initial, 0, 32);
    expect(first.yielded).toBe(true); expect(first.steps).toBe(32);
    expect(advanceArduino(first.execution, 0, 32).yielded).toBe(true);
    expect(initial.scopes).toHaveLength(1);
  });
  it.each([
    'void setup(){for(int i=0;i<2;i++){}i++;}void loop(){}',
    'void setup(){for(const int i=0;i<2;i++){} }void loop(){}',
    'void setup(){for(int i=0 i<2;i++){} }void loop(){}',
    'void setup(){for(int i=0;i<2;i++){break;}}void loop(){}',
  ])('diagnoses invalid or unsupported loop semantics: %s', (sketch) => {
    expect(() => compileArduinoSubset(sketch)).toThrow();
  });
});
