import { describe, expect, it } from 'vitest';
import { createComponent } from '../../model/components';
import { createProject } from '../../model/project';
import { initialSimulation, transitionSimulation } from './runtime';

const source = 'void setup(){Serial.begin(9600);Serial.println("Reading pin");pinMode(D1,INPUT);Serial.println(digitalRead(D1));}void loop(){}';
describe('digitalRead from the existing DC solver', () => {
  it.each([{ voltage: 3.3, expected: '1' }, { voltage: 0, expected: '0' }])('samples an externally powered INPUT at $voltage V', ({ voltage, expected }) => {
    const board = createComponent('esp8266', { x: 0, y: 0 }, 'esp');
    const supply = createComponent('power-supply', { x: 200, y: 0 }, 'supply');
    if (supply.kind !== 'power-supply') throw new Error('Invalid source fixture');
    supply.properties.voltage = voltage;
    const project = { ...createProject('input-read'), components: [board, supply], wires: [
      { id: 'signal', from: { componentId: 'esp', pinId: 'D1' }, to: { componentId: 'supply', pinId: 'positive' }, color: '#668c75', waypoints: [] },
      { id: 'ground', from: { componentId: 'esp', pinId: 'GND' }, to: { componentId: 'supply', pinId: 'negative' }, color: '#525b69', waypoints: [] },
    ] };
    const state = transitionSimulation(initialSimulation(), { type: 'firmware-run', componentId: 'esp', source }, project);
    expect(state.firmware.esp?.error).toBeNull();
    expect(state.firmware.esp?.execution?.serial.output).toBe(`Reading pin\r\n${expected}\r\n`);
  });
  it('refuses an unconnected INPUT without inventing a digital value and preserves preceding firmware output', () => {
    const project = { ...createProject('floating-read'), components: [createComponent('esp8266', { x: 0, y: 0 }, 'esp')] };
    const state = transitionSimulation(initialSimulation(), { type: 'firmware-run', componentId: 'esp', source }, project);
    expect(state.firmware.esp?.error).toBe('indeterminate-read');
    expect(state.firmware.esp?.serial?.output).toBe('Reading pin\r\n');
  });
});
