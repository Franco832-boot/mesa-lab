import { describe, expect, it } from 'vitest';
import { constructDht, readDht } from './dhtRuntime';
import type { DhtObject, HardwareSample } from './dhtRuntime';
import { advanceArduino, compileArduinoSubset, createArduinoExecution, UnoExecutionError } from './uno';
import { MAX_SERIAL_CHARACTERS } from './serial';

const at = { line: 1, column: 1, offset: 0 };
const observation = { sensorId: 'sensor', temperature: 25, humidity: 50 };
describe('DHT library timing contract', () => {
  it('requires begin, models warmup and caches failed attempts for the same two-second interval', () => {
    const hardware = new Map<string, HardwareSample>();
    const constructed = constructDht(2, 11, 'arduino-uno', at);
    expect(readDht(constructed, observation, 3000000, hardware).sample).toBeNull();
    let object: DhtObject = { ...constructed, beganAtUs: 0 };
    object = readDht(object, observation, 0, hardware);
    expect(object.sample).toBeNull();
    object = readDht(object, observation, 1000000, hardware);
    expect(object.sample).toBeNull();
    object = readDht(object, observation, 2000000, hardware);
    expect(object.sample).toEqual(observation);
    expect(readDht(object, { ...observation, temperature: 35 }, 3999999, hardware).sample?.temperature).toBe(25);
    expect(readDht(object, { ...observation, temperature: 35 }, 4000000, hardware).sample?.temperature).toBe(35);
  });
  it('shares a two-second physical sampling limit between multiple API objects on one sensor', () => {
    const hardware = new Map<string, HardwareSample>();
    const initialized = { ...constructDht(2, 11, 'arduino-uno', at), beganAtUs: 0 };
    expect(readDht(initialized, observation, 2000000, hardware).sample?.temperature).toBe(25);
    expect(readDht(initialized, { ...observation, temperature: 40 }, 2500000, hardware).sample?.temperature).toBe(25);
    expect(readDht(initialized, { ...observation, temperature: 40 }, 3999999, hardware).sample?.temperature).toBe(25);
    expect(readDht(initialized, { ...observation, temperature: 40 }, 4000000, hardware).sample?.temperature).toBe(40);
  });
});

describe('registered object methods, float values and virtual Serial', () => {
  it('supports the usual void return guard in setup/loop without leaking local scopes', () => {
    const source = 'void setup(){Serial.begin(9600);if(true){int local=3;return;}Serial.println("bad");}void loop(){Serial.println("ok");return;Serial.println("bad");}';
    const first = advanceArduino(createArduinoExecution(source), 0);
    expect(first.execution.serial.output).toBe('ok\r\n');
    expect(first.execution.scopes).toHaveLength(1);
    expect(advanceArduino(first.execution, 1).execution.serial.output).toBe('ok\r\nok\r\n');
  });
  it('executes float arithmetic, NAN/isnan and safe escaped string output without a circuit fallback', () => {
    const source = `#include <DHT.h>\nDHT arbitraryName(2,DHT11);float result=0;
      void setup(){Serial.begin(9600);arbitraryName.begin();result=1.5f+2.25;Serial.print("value=\\t");Serial.println(result,2);
        if(isnan(arbitraryName.readTemperature()))Serial.println("missing");}
      void loop(){delay(1000);}`;
    const result = advanceArduino(createArduinoExecution(source), 0);
    expect(result.execution.serial.output).toBe('value=\t3.75\r\nmissing\r\n');
    expect(result.execution.scopes[0]?.get('result')?.value?.value).toBe(3.75);
  });
  it('formats integers, floats, empty println and truncates only the bounded transient log', () => {
    const source = `void setup(){Serial.begin(115200);Serial.print(42);Serial.println();Serial.println(0.5);${`Serial.print("${'x'.repeat(8000)}");`.repeat(3)}}void loop(){delay(1000);}`;
    const execution = advanceArduino(createArduinoExecution(source), 0).execution;
    expect(execution.serial.output).toHaveLength(MAX_SERIAL_CHARACTERS);
    expect(execution.serial.truncated).toBe(true);
    expect(execution.serial.baudRate).toBe(115200);
    expect(createArduinoExecution(source).serial.output).toBe('');
  });
  it('resumes object construction and method/print expressions one instruction at a time', () => {
    const source = '#include "DHT.h"\nDHT sensor(2,DHT11);void setup(){Serial.begin(9600);sensor.begin();}void loop(){Serial.println(isnan(sensor.readHumidity()));delay(1000);}';
    const whole = advanceArduino(createArduinoExecution(source), 0);
    let sliced = advanceArduino(createArduinoExecution(source), 0, 1);
    for (let count = 0; sliced.yielded; count++) {
      if (count > 1000) throw new Error('VM did not yield correctly');
      sliced = advanceArduino(sliced.execution, 0, 1);
    }
    expect(sliced.execution).toEqual(whole.execution);
    expect(sliced.execution.serial.output).toBe('1\r\n');
  });
  it.each([
    'DHT sensor(2,DHT11);void setup(){}void loop(){}',
    '#include <LCD.h>\nvoid setup(){}void loop(){}',
    '#include <DHT.h>\nDHT s(2,DHT11);void setup(){s.computeHeatIndex();}void loop(){}',
    '#include <DHT.h>\nDHT s(2,DHT11);void setup(){float x=s.begin();}void loop(){}',
    'void setup(){Serial.available();}void loop(){}',
    'void setup(){float f="text";}void loop(){}',
    '#define FN(x) x\nvoid setup(){}void loop(){}',
  ])('rejects unsupported library contracts: %s', (source) => expect(() => compileArduinoSubset(source)).toThrow(UnoExecutionError));
});
