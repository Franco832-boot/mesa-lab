import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dhtFixture } from '../../test/dhtFixture';
import { serializeProject } from '../../model/project';
import type { CircuitProject } from '../../model/types';
import { createComponent } from '../../model/components';
import { initialSimulation, transitionSimulation } from './runtime';
import type { SimulationState } from './runtime';
import { nextFirmwareDelay } from './firmwareRuntime';

const sketch = readFileSync(new URL('../../../examples/arduino/dht11.ino', import.meta.url), 'utf8');
function run(doc: CircuitProject, source = sketch) {
  return transitionSimulation(initialSimulation(), { type: 'firmware-run', componentId: 'uno', source }, doc);
}
function advance(state: SimulationState, doc: CircuitProject, elapsedMs: number): SimulationState {
  let next = transitionSimulation(state, { type: 'firmware-advance', elapsedMs }, doc);
  for (let count = 0; nextFirmwareDelay(next) === 0; count++) {
    if (count > 10000) throw new Error('Unexpected pending execution');
    next = transitionSimulation(next, { type: 'firmware-advance', elapsedMs: 0 }, doc);
  }
  return next;
}
const output = (state: SimulationState) => state.firmware.uno?.execution?.serial.output;
describe('DHT.h sketch through the actual electrical circuit and virtual Serial', () => {
  it('reads with just three wires even when the sketch disables the MCU pull-up after begin', () => {
    const doc = dhtFixture();
    const source = sketch.replace('dht.begin();', 'dht.begin(); pinMode(DHTPIN, INPUT);');
    const state = advance(run(doc, source), doc, 2000);
    expect(state.firmware.uno?.error).toBeNull();
    expect(output(state)).toBe('Humidity: 50 % | Temperature: 25 C\r\n');
  });
  it('supports an arbitrary configured GPIO and measured environment rather than a special example pin/value', () => {
    const doc = dhtFixture();
    const data = doc.wires.find((wire) => wire.id === 'data'), sensor = doc.components.find((item) => item.kind === 'dht11');
    if (!data || sensor?.kind !== 'dht11') throw new Error('Missing fixture');
    data.from.pinId = 'D7'; sensor.properties = { temperature: 18, humidity: 73 };
    expect(output(advance(run(doc, sketch.replace('#define DHTPIN 2', '#define DHTPIN 7')), doc, 2000))).toBe('Humidity: 73 % | Temperature: 18 C\r\n');
  });
  it('executes the reusable example and preserves the saved document and per-board isolation', () => {
    const doc = dhtFixture(), saved = serializeProject(doc);
    let state = advance(run(doc), doc, 2000);
    expect(state.firmware.uno?.error).toBeNull();
    expect(output(state)).toBe('Humidity: 50 % | Temperature: 25 C\r\n');
    expect(state.firmware.uno?.execution?.serial.baudRate).toBe(9600);
    expect(serializeProject(doc)).toBe(saved);
    doc.components.push(createComponent('arduino-uno', { x: 10, y: 300 }, 'other'));
    state = transitionSimulation(state, { type: 'firmware-run', componentId: 'other', source: 'void setup(){Serial.begin(115200);Serial.println("other");}void loop(){delay(1000);}' }, doc);
    expect(state.firmware.other?.execution?.serial.output).toBe('other\r\n');
    expect(output(state)).toBe('Humidity: 50 % | Temperature: 25 C\r\n');
    expect(transitionSimulation(state, { type: 'reset' }, doc)).toEqual(initialSimulation());
  });
  it.each(['data', 'vcc', 'ground'])('returns NaN, handles isnan and prints a failure for missing %s', (id) => {
    const doc = dhtFixture(); doc.wires = doc.wires.filter((wire) => wire.id !== id);
    const state = advance(run(doc), doc, 2000);
    expect(state.firmware.uno?.error).toBeNull();
    expect(output(state)).toBe('DHT11: read failed\r\n');
  });
  it('rejects a validly powered sensor attached to the wrong requested GPIO', () => {
    const doc = dhtFixture();
    expect(output(advance(run(doc, sketch.replace('#define DHTPIN 2', '#define DHTPIN 3')), doc, 2000))).toBe('DHT11: read failed\r\n');
  });
  it('shares a coherent pair of readings and respects the API cache after inspector environment events', () => {
    const source = '#include <DHT.h>\nDHT sensor(2,DHT11);void setup(){Serial.begin(9600);sensor.begin();delay(2000);}void loop(){Serial.print(sensor.readTemperature(),0);Serial.print("/");Serial.println(sensor.readHumidity(),0);delay(500);}';
    const doc = dhtFixture(), saved = serializeProject(doc);
    let state = advance(run(doc, source), doc, 2000);
    expect(output(state)).toBe('25/50\r\n');
    state = transitionSimulation(state, { type: 'dht11', componentId: 'sensor', temperature: 32.6, humidity: 67.2 }, doc);
    state = advance(state, doc, 1500);
    expect(output(state)).toBe('25/50\r\n'.repeat(4));
    state = advance(state, doc, 500);
    expect(output(state)).toBe('25/50\r\n'.repeat(4) + '33/67\r\n');
    expect(serializeProject(doc)).toBe(saved);
    state = transitionSimulation(state, { type: 'pause' }, doc);
    expect(advance(state, doc, 1000)).toBe(state);
  });
  it('invalidates even a cached reading if the actual circuit has become disconnected', () => {
    const doc = dhtFixture();
    const source = '#include <DHT.h>\nDHT d(2,DHT11);void setup(){Serial.begin(9600);d.begin();delay(2000);}void loop(){Serial.println(d.readHumidity(),0);delay(500);}';
    let state = advance(run(doc, source), doc, 2000);
    expect(output(state)).toBe('50\r\n');
    const disconnected = { ...doc, wires: doc.wires.filter((wire) => wire.id !== 'data') };
    state = advance(state, disconnected, 500);
    expect(output(state)).toBe('50\r\nnan\r\n');
  });
  it('keeps millis/GPIO execution working while a sensor sketch runs on a neighboring board', () => {
    const doc = dhtFixture();
    doc.components.push(createComponent('arduino-uno', { x: 10, y: 300 }, 'other'));
    let state = run(doc);
    state = transitionSimulation(state, { type: 'firmware-run', componentId: 'other', source: 'void setup(){pinMode(13,OUTPUT);}void loop(){digitalWrite(13,HIGH);delay(1000);digitalWrite(13,LOW);delay(1000);}' }, doc);
    state = advance(state, doc, 2000);
    expect(output(state)).toBe('Humidity: 50 % | Temperature: 25 C\r\n');
    expect(state.firmware.other?.error).toBeNull();
    expect(state.firmware.other?.execution?.levels.D13).toBe('HIGH');
  });
});
