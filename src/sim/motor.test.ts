import { describe, expect, it } from 'vitest';
import { motorFixture, motorInputs, motorWire } from '../test/motorFixture';
import { evaluateCircuit } from './engine';
import { pinKey } from './topology';
import { createComponent } from '../model/components';

describe('minimum real DC motor circuit', () => {
  it('solves motor current, bridge loss and loaded battery voltage independently from KVL', () => {
    const result = evaluateCircuit(motorFixture(), motorInputs());
    // Motor path: 100 ohm winding + (1.4 + 1.2)/0.6 equivalent driver ohms.
    // Battery 2 ohms feeds that path in parallel with 100k standby load.
    const bus = 9 / (1 + 2 * (1 / (100 + 13 / 3) + 1 / 100000));
    const current = bus / (100 + 13 / 3);
    expect(result.diagnostics).toEqual([]);
    expect(result.components.motor?.current).toBeCloseTo(current, 10);
    expect(result.components.motor?.voltage).toBeCloseTo(current * 100, 10);
    expect(result.components.motor?.motor).toEqual({ direction: 'forward', speed: expect.closeTo(current * 100 / 9, 10) });
    expect(result.components.battery?.voltage).toBeCloseTo(bus, 10);
    expect(result.components.battery?.current).toBeCloseTo(current + bus / 100000, 10);
    expect(result.components.bridge?.power).toBeCloseTo(current ** 2 * 13 / 3, 10);
    expect(result.components.bridge?.bridge).toEqual(['forward', 'disabled']);
    const supply = result.pins[pinKey('bridge', 'VCC2')]?.voltage;
    const high = result.pins[pinKey('bridge', 'OUT1')]?.voltage;
    expect((supply ?? 0) - (high ?? 0)).toBeCloseTo(current * 7 / 3, 10);
  });
  it('reverses signed voltage/current and handles both brake levels', () => {
    const forward = evaluateCircuit(motorFixture(), motorInputs()).components.motor;
    const reverse = evaluateCircuit(motorFixture(), motorInputs(true, false, true));
    expect(reverse.components.motor?.voltage).toBeCloseTo(-(forward?.voltage ?? 0), 10);
    expect(reverse.components.motor?.current).toBeCloseTo(-(forward?.current ?? 0), 10);
    expect(reverse.components.motor?.motor?.direction).toBe('reverse');
    for (const high of [false, true]) {
      const brake = evaluateCircuit(motorFixture(), motorInputs(true, high, high));
      expect(brake.components.motor?.voltage).toBeCloseTo(0, 10);
      expect(brake.components.motor?.current).toBe(0);
      expect(brake.components.motor?.motor).toEqual({ direction: 'stopped', speed: 0 });
      expect(brake.components.bridge?.bridge?.[0]).toBe('brake');
    }
  });
  it('removes disabled output drivers without inventing floating motor voltage', () => {
    const result = evaluateCircuit(motorFixture(), motorInputs(false));
    expect(result.components.bridge?.bridge?.[0]).toBe('disabled');
    expect(result.components.motor?.voltage).toBeUndefined();
    expect(result.components.motor?.current).toBeUndefined();
    expect(result.components.motor?.motor).toEqual({ direction: 'unresolved' });
  });
  it.each(['logic-power', 'logic-ground', 'motor-power', 'motor-ground'])('does not drive with %s unplugged', (id) => {
    const project = motorFixture(); project.wires = project.wires.filter((wire) => wire.id !== id);
    const result = evaluateCircuit(project, motorInputs());
    expect(result.components.bridge?.bridge?.[0]).toBe('invalid');
    expect(result.components.motor?.motor?.speed ?? 0).toBe(0);
    expect(result.diagnostics.some((issue) => issue.code === 'driver-supply')).toBe(true);
  });
});

describe('independent battery source', () => {
  it('solves loaded sag, overload and finite short-circuit current', () => {
    const project = motorFixture();
    project.components = project.components.filter((part) => part.id === 'battery');
    project.wires = [];
    project.components.push({ ...createComponent('resistor', { x: 0, y: 0 }, 'load'), kind: 'resistor', properties: { resistance: 10 } });
    project.wires.push(motorWire('p', 'battery', 'positive', 'load', '1'), motorWire('n', 'battery', 'negative', 'load', '2'));
    const loaded = evaluateCircuit(project);
    expect(loaded.components.battery?.current).toBeCloseTo(.75, 10);
    expect(loaded.components.battery?.voltage).toBeCloseTo(7.5, 10);
    expect(loaded.diagnostics.map((issue) => issue.code)).toContain('battery-sag');
    expect(loaded.diagnostics.map((issue) => issue.code)).toContain('battery-overcurrent');
    project.wires.push(motorWire('short', 'battery', 'positive', 'battery', 'negative'));
    const short = evaluateCircuit(project);
    expect(short.components.battery?.voltage).toBe(0);
    expect(short.components.battery?.current).toBeCloseTo(4.5, 10);
    expect(short.diagnostics.map((issue) => issue.code)).toContain('short-circuit');
    const battery = project.components.find((part) => part.kind === 'battery-9v');
    if (battery?.kind !== 'battery-9v') throw new Error('fixture');
    battery.properties.internalResistance = 0;
    const idealShort = evaluateCircuit(project);
    expect(idealShort.components.battery?.current).toBeUndefined();
    expect(idealShort.components.battery?.voltage).toBeUndefined();
    expect(idealShort.diagnostics.map((issue) => issue.code)).toContain('short-circuit');
  });
  it('does not hide charging/backfeed into a nonrechargeable battery', () => {
    const project = motorFixture();
    project.components = project.components.filter((part) => part.id === 'battery'); project.wires = [];
    project.components.push({ ...createComponent('power-supply', { x: 0, y: 0 }, 'supply'), kind: 'power-supply', properties: { voltage: 12 } });
    project.wires.push(motorWire('p', 'supply', 'positive', 'battery', 'positive'), motorWire('n', 'supply', 'negative', 'battery', 'negative'));
    const result = evaluateCircuit(project);
    expect(result.components.battery?.current).toBeCloseTo(-1.5, 10);
    expect(result.components.battery?.voltage).toBeCloseTo(12, 10);
    expect(result.diagnostics.map((issue) => issue.code)).toContain('reverse-polarity');
  });
});

describe('two channels, connections and electrical bounds', () => {
  it('runs independently through the same loaded battery, including one motor braking', () => {
    const project = motorFixture();
    project.components.push(createComponent('dc-motor', { x: 650, y: 100 }, 'motor2'));
    project.wires = project.wires.filter((wire) => !wire.id.startsWith('unused-'));
    project.wires.push(motorWire('en2', 'uno', 'D7', 'bridge', 'EN3,4'), motorWire('in3', 'uno', 'D6', 'bridge', 'IN3'),
      motorWire('in4', 'uno', 'D5', 'bridge', 'IN4'), motorWire('out3', 'bridge', 'OUT3', 'motor2', 'positive'), motorWire('out4', 'bridge', 'OUT4', 'motor2', 'negative'));
    const inputs = motorInputs();
    inputs.gpio = { ...inputs.gpio,
      [pinKey('uno', 'D7')]: { mode: 'output', level: 'HIGH' },
      [pinKey('uno', 'D6')]: { mode: 'output', level: 'LOW' },
      [pinKey('uno', 'D5')]: { mode: 'output', level: 'HIGH' },
    };
    const result = evaluateCircuit(project, inputs);
    const bus = 9 / (1 + 2 * (2 / (100 + 13 / 3) + 1 / 100000));
    expect(result.diagnostics).toEqual([]);
    expect(result.components.motor?.current).toBeCloseTo(bus / (100 + 13 / 3), 10);
    expect(result.components.motor2?.current).toBeCloseTo(-bus / (100 + 13 / 3), 10);
    expect(result.components.bridge?.bridge).toEqual(['forward', 'reverse']);
    inputs.gpio = { ...inputs.gpio, [pinKey('uno', 'D5')]: { mode: 'output', level: 'LOW' } };
    const brake = evaluateCircuit(project, inputs);
    expect(brake.components.motor?.motor?.direction).toBe('forward');
    expect(brake.components.motor2?.motor?.direction).toBe('stopped');
    expect(brake.components.bridge?.bridge).toEqual(['forward', 'brake']);
  });
  it.each(['enable', 'in1', 'in2'])('does not substitute a floating %s with a valid control signal', (id) => {
    const project = motorFixture(); project.wires = project.wires.filter((wire) => wire.id !== id);
    const result = evaluateCircuit(project, motorInputs());
    expect(result.components.motor?.motor?.speed ?? 0).toBe(0);
    expect(result.diagnostics.some((issue) => issue.code === 'driver-input')).toBe(true);
  });
  it('respects swapped motor leads, missing motor leads and missing battery despite HIGH GPIO', () => {
    const project = motorFixture();
    for (const wire of project.wires) if (wire.to.componentId === 'motor') wire.to.pinId = wire.to.pinId === 'positive' ? 'negative' : 'positive';
    expect(evaluateCircuit(project, motorInputs()).components.motor?.motor?.direction).toBe('reverse');
    project.wires = project.wires.filter((wire) => wire.id !== 'out2');
    expect(evaluateCircuit(project, motorInputs()).components.motor?.motor?.speed ?? 0).toBe(0);
    const noBattery = motorFixture(); noBattery.components = noBattery.components.filter((part) => part.id !== 'battery');
    noBattery.wires = noBattery.wires.filter((wire) => wire.from.componentId !== 'battery');
    expect(evaluateCircuit(noBattery, motorInputs()).components.motor?.motor?.speed ?? 0).toBe(0);
  });
  it('diagnoses reversed battery supply and rejects out-of-range supply and collapse under load', () => {
    const reversed = motorFixture();
    for (const wire of reversed.wires) if (wire.from.componentId === 'battery') wire.from.pinId = wire.from.pinId === 'positive' ? 'negative' : 'positive';
    const result = evaluateCircuit(reversed, motorInputs());
    expect(result.diagnostics.map((issue) => issue.code)).toContain('reverse-polarity');
    expect(result.components.bridge?.bridge?.[0]).toBe('invalid');
    for (const voltage of [0, 3, 40]) {
      const project = motorFixture();
      const battery = project.components.find((part) => part.kind === 'battery-9v');
      if (battery?.kind !== 'battery-9v') throw new Error('fixture');
      battery.properties.voltage = voltage;
      expect(evaluateCircuit(project, motorInputs()).components.bridge?.bridge?.[0]).toBe('invalid');
    }
    const project = motorFixture();
    const battery = project.components.find((part) => part.kind === 'battery-9v');
    if (battery?.kind !== 'battery-9v') throw new Error('fixture');
    battery.properties.internalResistance = 100;
    const collapsed = evaluateCircuit(project, motorInputs());
    expect(collapsed.components.motor?.motor?.speed ?? 0).toBe(0);
    expect(collapsed.components.bridge?.bridge?.[0]).toBe('invalid');
    expect(collapsed.diagnostics.map((issue) => issue.code)).toContain('driver-supply');
  });
  it('retains real finite short/overload currents and warnings without inventing damage', () => {
    const project = motorFixture();
    project.wires.push(motorWire('output-short', 'bridge', 'OUT1', 'bridge', 'OUT2'));
    const result = evaluateCircuit(project, motorInputs());
    const bus = 9 / (1 + 2 * (1 / (13 / 3) + 1 / 100000));
    expect(result.components.battery?.voltage).toBeCloseTo(bus, 10);
    expect(result.diagnostics.map((issue) => issue.code)).toEqual(expect.arrayContaining(['short-circuit', 'driver-overcurrent', 'battery-overcurrent', 'battery-sag']));
    expect(result.components.motor?.motor?.speed).toBe(0);
    expect(Object.values(result.components).some((component) => component.condition === 'damaged')).toBe(false);
    const overloaded = motorFixture();
    const motor = overloaded.components.find((part) => part.kind === 'dc-motor');
    if (motor?.kind !== 'dc-motor') throw new Error('fixture');
    motor.properties.resistance = 1;
    const fault = evaluateCircuit(overloaded, motorInputs());
    expect(fault.diagnostics.map((issue) => issue.code)).toEqual(expect.arrayContaining(['driver-overcurrent', 'motor-overload']));
    expect(fault.components.motor?.condition).toBe('warning');
  });
  it('is deterministic when project component and wire arrays are reordered', () => {
    const project = motorFixture(), before = evaluateCircuit(project, motorInputs());
    project.components.reverse(); project.wires.reverse();
    expect(evaluateCircuit(project, motorInputs())).toEqual(before);
  });
});
