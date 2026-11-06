import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { advanceArduino, advanceArduinoMicros, compileArduinoSubset, createArduinoExecution, MAX_ADVANCE_STEPS, UnoExecutionError } from './uno';
import type { UnoExecution, UnoGpioEvent } from './uno';

const traditional = readFileSync(new URL('../../examples/arduino/blink.ino', import.meta.url), 'utf8');
const polling = readFileSync(new URL('../../examples/arduino/blink-without-delay.ino', import.meta.url), 'utf8');
const globalValue = (state: UnoExecution, name: string) => state.scopes[0]?.get(name)?.value?.value;
function complete(previous: UnoExecution, elapsedMs: number, budget = MAX_ADVANCE_STEPS) {
  let result = advanceArduino(previous, elapsedMs, budget);
  const gpio: UnoGpioEvent[] = [...result.gpio];
  let slices = 1;
  while (result.yielded) {
    if (++slices > 100000) throw new Error('Unexpected non-terminating advance');
    result = advanceArduino(result.execution, 0, budget);
    gpio.push(...result.gpio);
  }
  return { execution: result.execution, gpio, slices };
}
function expectCode(action: () => unknown, code: string) {
  try { action(); }
  catch (error) {
    expect(error).toBeInstanceOf(UnoExecutionError);
    if (error instanceof UnoExecutionError) expect(error.code).toBe(code);
    return;
  }
  throw new Error('Expected an execution error');
}

describe('resumable Arduino expressions and virtual clock', () => {
  it('executes the saved traditional Blink example at unchanged exact boundaries', () => {
    const result = complete(createArduinoExecution(traditional), 2000);
    expect(result.gpio.map((event) => [event.atMs, event.state.level])).toEqual([[0, 'LOW'], [0, 'HIGH'], [1000, 'LOW'], [2000, 'HIGH']]);
  });
  it('executes the saved millis example without delay and keeps an immutable previous state', () => {
    const initial = createArduinoExecution(polling);
    const before = complete(initial, 999);
    expect(before.gpio.map((event) => event.state.level)).toEqual(['LOW']);
    const high = complete(before.execution, 1);
    expect(high.gpio.map((event) => [event.atMs, event.state.level])).toEqual([[1000, 'HIGH']]);
    const low = complete(high.execution, 1000);
    expect(low.gpio.map((event) => [event.atMs, event.state.level])).toEqual([[2000, 'LOW']]);
    expect(initial.scopes[0]?.size).toBe(0);
    expect(initial.pc).toBe(0);
    expect(globalValue(high.execution, 'previousMillis')).toBe(1000);
  });
  it('runs two independent millis tasks within one loop', () => {
    const source = `unsigned long a=0; unsigned long b=0; bool x=false; bool y=false;
      void setup(){pinMode(13,OUTPUT);pinMode(12,OUTPUT);}
      void loop(){unsigned long now=millis();
        if(now-a>=1000UL){a=now;x=!x;digitalWrite(13,x);}
        if(now-b>=250UL){b=now;y=!y;digitalWrite(12,y);}
      }`;
    const result = complete(createArduinoExecution(source), 1000);
    expect(result.gpio.filter((event) => event.atMs > 0).map((event) => [event.atMs, event.pinId, event.state.level]))
      .toEqual([[250, 'D12', 'HIGH'], [500, 'D12', 'LOW'], [750, 'D12', 'HIGH'], [1000, 'D13', 'HIGH'], [1000, 'D12', 'LOW']]);
  });
  it('preserves full state and ordered effects across time partitions and one-instruction slices', () => {
    const initial = createArduinoExecution(polling);
    const whole = complete(initial, 1001);
    let state = initial;
    const events: UnoGpioEvent[] = [];
    for (const delta of [0, 16, 233, 250, 500, 2]) {
      const next = complete(state, delta, 1);
      state = next.execution; events.push(...next.gpio);
    }
    expect(state).toEqual(whole.execution);
    expect(events).toEqual(whole.gpio);
    expect(whole.slices).toBeGreaterThan(1);
  });
  it('bounds work and cooperatively resumes even a large requested polling interval', () => {
    const result = advanceArduino(createArduinoExecution('int n=0;void setup(){}void loop(){n++;}'), 100000);
    expect(result.yielded).toBe(true);
    expect(result.steps).toBe(MAX_ADVANCE_STEPS);
    expect(result.execution.pendingUntilUs).toBe(100000000);
    expect(result.execution.timeMs).toBeLessThan(100000);
    const next = advanceArduino(result.execution, 0);
    expect(next.execution.timeMs).toBeGreaterThan(result.execution.timeMs);
    expect(next.execution.pendingUntilUs).toBe(100000000);
  });
  it('suspends within nested blocks and preserves local scopes and microsecond deadlines', () => {
    const source = `unsigned long saved=0; void setup(){pinMode(13,OUTPUT);}
      void loop(){int local=7;if(local==7){digitalWrite(13,HIGH);delayMicroseconds(250);saved=micros();digitalWrite(13,LOW);}delay(1);}`;
    const initial = complete(createArduinoExecution(source), 0);
    expect(initial.execution.wakeAtUs).toBe(250);
    const before = advanceArduinoMicros(initial.execution, 249);
    expect(before.gpio).toEqual([]);
    const edge = advanceArduinoMicros(before.execution, 1);
    expect(edge.gpio).toEqual([{ atMs: 0.25, pinId: 'D13', state: { mode: 'output', level: 'LOW' } }]);
    expect(globalValue(edge.execution, 'saved')).toBe(250);
    expect(edge.execution.wakeAtUs).toBe(1250);
  });
  it('implements precedence, integer division/remainder, assignment and prefix/postfix updates', () => {
    const source = `int a=2;int b=0;int c=0;int d=0;int e=0;int f=0;
      void setup(){b=3+4*2;c=(3+4)*2;d=-7/3;e=-7%3;b+=a++;c-=++a;d*=2;e%=2;f=(a=b=5);}
      void loop(){delay(1000);}`;
    const state = complete(createArduinoExecution(source), 0).execution;
    expect(['a','b','c','d','e','f'].map((name) => globalValue(state, name))).toEqual([5,5,10,-4,-1,5]);
  });
  it('short-circuits logical expressions, binds else correctly, and scopes shadowed variables', () => {
    const source = `int result=0;int skipped=0;bool flag=false;
      void setup(){int result=9;if(false && ++skipped) result=1;
        if(true || ++skipped){int inner=2;if(inner==3)result=3;else if(inner==2)result=4;else result=5;}
        flag=(result==4 && skipped==0);}
      void loop(){if(flag)result=7;else result=8;delay(1000);}`;
    const state = complete(createArduinoExecution(source), 0).execution;
    expect(globalValue(state, 'result')).toBe(7);
    expect(globalValue(state, 'skipped')).toBe(0);
    expect(globalValue(state, 'flag')).toBe(1);
    expect(state.scopes.every((scope) => !scope.has('inner'))).toBe(true);
  });
  it('uses board-specific integer widths and exact unsigned 32-bit arithmetic', () => {
    const source = 'int x=40000;void setup(){}void loop(){delay(1000);}';
    expectCode(() => complete(createArduinoExecution(source), 0), 'arithmetic-error');
    expect(globalValue(complete(createArduinoExecution(source, 'esp8266'), 0).execution, 'x')).toBe(40000);
    const unsigned = complete(createArduinoExecution(`unsigned long x=4294967295UL;unsigned long y=0;
      void setup(){x*=4294967295UL;y-=1;}void loop(){delay(1000);}`), 0).execution;
    expect(globalValue(unsigned, 'x')).toBe(1);
    expect(globalValue(unsigned, 'y')).toBe(0xffffffff);
  });
  it('wraps micros at 32 bits while the internal clock and unsigned elapsed subtraction advance', () => {
    const state = advanceArduinoMicros(createArduinoExecution(`unsigned long before=0;unsigned long after=0;unsigned long elapsed=0;
      void setup(){delay(4294967L);delayMicroseconds(295);before=micros();delayMicroseconds(1);after=micros();elapsed=after-before;}
      void loop(){delay(86400000);}`), 4294967296).execution;
    expect(['before','after','elapsed'].map((name) => globalValue(state, name))).toEqual([0xffffffff,0,1]);
    expect(state.timeUs).toBe(4294967296);
  });
  it('wraps millis independently of micros at 32 bits', () => {
    const source = `unsigned long before=0;unsigned long after=0;unsigned long elapsed=0;
      void setup(){${'delay(86400000);'.repeat(49)}delay(61367295L);before=millis();delay(1);after=millis();elapsed=after-before;}
      void loop(){delay(86400000);}`;
    const state = complete(createArduinoExecution(source), 4294967296).execution;
    expect(['before','after','elapsed'].map((name) => globalValue(state, name))).toEqual([0xffffffff,0,1]);
    expect(state.timeUs).toBe(4294967296000);
  });
  it.each([
    ['int n=0;void setup(){n=1/0;}void loop(){}', 'arithmetic-error'],
    ['void setup(){int n;digitalWrite(13,n);}void loop(){}', 'type-error'],
    ['const int n=1;void setup(){n++;}void loop(){}', 'type-error'],
    ['int n=1;int n=2;void setup(){}void loop(){}', 'name-error'],
    ['void setup(){if(false){missing=1;}}void loop(){}', 'name-error'],
    ['void setup(){bool b=false;b++;}void loop(){}', 'type-error'],
    ['void setup(){int n=32767;n++;}void loop(){}', 'arithmetic-error'],
    ['int n=2;void setup(){int n=n+1;}void loop(){}', 'type-error'],
    ['void setup(){delay(-1);}void loop(){}', 'invalid-value'],
  ])('diagnoses invalid semantics: %s', (source, code) => {
    expectCode(() => complete(createArduinoExecution(source ?? ''), 0), code ?? '');
  });
  it('rejects pathological nesting without overflowing the JavaScript stack', () => {
    expectCode(() => compileArduinoSubset(`void setup(){${'{'.repeat(100)};${'}'.repeat(100)}}void loop(){}`), 'nesting-limit');
    expectCode(() => compileArduinoSubset(`void setup(){int n=${'('.repeat(100)}1${')'.repeat(100)};}void loop(){}`), 'nesting-limit');
    expectCode(() => compileArduinoSubset(`void setup(){int n=${'1+'.repeat(100)}1;}void loop(){}`), 'nesting-limit');
  });
  it('accepts formerly fatal empty/zero-delay loops and makes deterministic progress', () => {
    for (const body of ['', 'delay(0);']) {
      const result = complete(createArduinoExecution(`void setup(){}void loop(){${body}}`), 20);
      expect(result.execution.timeUs).toBe(20000);
      expect(result.execution.wakeAtUs).toBe(21000);
    }
  });
  it('supports variable names that also exist on Object.prototype', () => {
    const state = complete(createArduinoExecution('int constructor=0;void setup(){constructor=3;}void loop(){delay(1000);}'), 0).execution;
    expect(globalValue(state, 'constructor')).toBe(3);
  });
  it('rejects invalid time deltas and slice budgets', () => {
    const state = createArduinoExecution(traditional);
    for (const delta of [-0.0000000001, NaN, Infinity, Number.MAX_SAFE_INTEGER]) expectCode(() => advanceArduino(state, delta), 'invalid-value');
    for (const budget of [0, -1, 4097, 1.5]) expectCode(() => advanceArduino(state, 0, budget), 'invalid-value');
  });
});
