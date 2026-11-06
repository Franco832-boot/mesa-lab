import { describe, expect, it } from 'vitest';
import { dhtFixture } from '../test/dhtFixture';
import { observeDht11 } from './dht11';
import { evaluateCircuit } from './engine';
import { pinKey } from './topology';
import { createComponent } from '../model/components';

describe('electrically validated DHT11 observations', () => {
  it('uses solved supply/data voltages and the physical sensor environment', () => {
    const doc = dhtFixture(), snapshot = evaluateCircuit(doc);
    expect(doc.components.map((item) => item.kind)).toEqual(['arduino-uno', 'dht11']);
    expect(doc.wires).toHaveLength(3);
    expect(snapshot.components.sensor?.current).toBeCloseTo(5 / 50000, 12);
    expect(snapshot.pins[pinKey('sensor', 'DATA')]?.voltage).toBeCloseTo(5, 12);
    expect(snapshot.diagnostics.some((issue) => issue.code === 'open-circuit' && issue.componentIds.includes('sensor'))).toBe(false);
    expect(observeDht11(doc, {}, 'uno', 'D2')).toEqual({ sensorId: 'sensor', temperature: 25, humidity: 50 });
    expect(observeDht11(doc, { dht11: { sensor: { temperature: 30.6, humidity: 65.2 } } }, 'uno', 'D2')).toEqual({ sensorId: 'sensor', temperature: 31, humidity: 65 });
    expect(observeDht11(doc, {}, 'uno', 'D3')).toBeNull();
  });
  it.each(['vcc', 'ground', 'data'])('rejects a missing %s connection', (id) => {
    const doc = dhtFixture(); doc.wires = doc.wires.filter((wire) => wire.id !== id);
    expect(observeDht11(doc, {}, 'uno', 'D2')).toBeNull();
  });
  it.each([0, 2.9, 5.6, 9])('rejects supply voltage %s V', (voltage) => {
    const doc = dhtFixture();
    doc.components.push({ ...createComponent('power-supply', { x: 600, y: 100 }, 'supply'), kind: 'power-supply', properties: { voltage } });
    const vcc = doc.wires.find((wire) => wire.id === 'vcc');
    if (!vcc) throw new Error('Missing fixture wire');
    vcc.from = { componentId: 'supply', pinId: 'positive' };
    doc.wires.push({ id: 'supply-ground', from: { componentId: 'supply', pinId: 'negative' }, to: { componentId: 'uno', pinId: 'GND' }, color: '#668c75', waypoints: [] });
    expect(observeDht11(doc, {}, 'uno', 'D2')).toBeNull();
  });
  it('biases DATA with the built-in pull-up even with a normal input, but rejects driven or shorted DATA', () => {
    const doc = dhtFixture();
    expect(observeDht11(doc, { gpio: { [pinKey('uno', 'D2')]: { mode: 'input', level: 'FLOATING' } } }, 'uno', 'D2')).not.toBeNull();
    expect(observeDht11(doc, { gpio: { [pinKey('uno', 'D2')]: { mode: 'input-pullup', level: 'FLOATING' } } }, 'uno', 'D2')).not.toBeNull();
    expect(observeDht11(doc, { gpio: { [pinKey('uno', 'D2')]: { mode: 'output', level: 'HIGH' } } }, 'uno', 'D2')).toBeNull();
    doc.wires.push({ id: 'short', from: { componentId: 'sensor', pinId: 'DATA' }, to: { componentId: 'sensor', pinId: 'GND' }, color: '#668c75', waypoints: [] });
    expect(observeDht11(doc, {}, 'uno', 'D2')).toBeNull();
    const snapshot = evaluateCircuit(doc);
    expect(snapshot.components.sensor?.current).toBeCloseTo(5 / 50000 + 5 / 10000, 12);
    expect(snapshot.components.sensor?.power).toBeCloseTo(25 / 50000 + 25 / 10000, 12);
  });
  it('solves the internal pull-up as a resistor, including an independently calculated loaded divider', () => {
    const doc = dhtFixture();
    doc.components.push({ ...createComponent('resistor', { x: 500, y: 100 }, 'load'), kind: 'resistor', properties: { resistance: 10000 } });
    doc.wires.push(
      { id: 'load-data', from: { componentId: 'sensor', pinId: 'DATA' }, to: { componentId: 'load', pinId: '1' }, color: '#668c75', waypoints: [] },
      { id: 'load-ground', from: { componentId: 'sensor', pinId: 'GND' }, to: { componentId: 'load', pinId: '2' }, color: '#668c75', waypoints: [] },
    );
    const snapshot = evaluateCircuit(doc);
    // 10 kΩ internal + 10 kΩ external: DATA = 2.5 V, bus current = 250 µA.
    expect(snapshot.pins[pinKey('sensor', 'DATA')]?.voltage).toBeCloseTo(2.5, 12);
    expect(snapshot.components.load?.current).toBeCloseTo(5 / 20000, 12);
    expect(snapshot.components.sensor?.current).toBeCloseTo(5 / 50000 + 5 / 20000, 12);
    expect(observeDht11(doc, {}, 'uno', 'D2')).toBeNull();
  });
  it('rejects reversed power, complete disconnection and unsupported DATA overvoltage on ESP8266', () => {
    const doc = dhtFixture();
    for (const wire of doc.wires) {
      if (wire.to.pinId === 'VCC') wire.to.pinId = 'GND';
      else if (wire.to.pinId === 'GND') wire.to.pinId = 'VCC';
    }
    expect(observeDht11(doc, {}, 'uno', 'D2')).toBeNull();
    expect(observeDht11({ ...doc, wires: [] }, {}, 'uno', 'D2')).toBeNull();
    const powered = dhtFixture();
    powered.components.push(createComponent('esp8266', { x: 600, y: 100 }, 'esp'));
    powered.wires.push(
      { id: 'esp-data', from: { componentId: 'sensor', pinId: 'DATA' }, to: { componentId: 'esp', pinId: 'D2' }, color: '#668c75', waypoints: [] },
      { id: 'esp-gnd', from: { componentId: 'sensor', pinId: 'GND' }, to: { componentId: 'esp', pinId: 'GND' }, color: '#668c75', waypoints: [] },
    );
    expect(observeDht11(powered, {}, 'esp', 'D2')).toBeNull();
  });
  it('rejects two sensors on the same single-sensor bus and invalid transient environment data', () => {
    const doc = dhtFixture();
    expect(observeDht11(doc, { dht11: { sensor: { temperature: NaN, humidity: 50 } } }, 'uno', 'D2')).toBeNull();
    doc.components.push(createComponent('dht11', { x: 450, y: 180 }, 'second'));
    doc.wires.push({ id: 'second-data', from: { componentId: 'second', pinId: 'DATA' }, to: { componentId: 'sensor', pinId: 'DATA' }, color: '#668c75', waypoints: [] });
    expect(observeDht11(doc, {}, 'uno', 'D2')).toBeNull();
  });
});
