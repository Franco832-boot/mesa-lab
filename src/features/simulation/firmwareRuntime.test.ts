import { describe, expect, it } from 'vitest';
import { createComponent } from '../../model/components';
import { createProject, serializeProject } from '../../model/project';
import { pinKey } from '../../sim/topology';
import type { CircuitProject } from '../../model/types';
import { initialSimulation, transitionSimulation } from './runtime';
import { nextFirmwareDelay } from './firmwareRuntime';

const blink = (pin = '13', period = 1000) => `void setup(){pinMode(${pin}, OUTPUT);} void loop(){digitalWrite(${pin}, HIGH);delay(${period});digitalWrite(${pin}, LOW);delay(${period});}`;
const wire = (id: string, a: string, pa: string, b: string, pb: string) => ({ id,
  from: { componentId: a, pinId: pa }, to: { componentId: b, pinId: pb }, color: '#668c75', waypoints: [] });
function fixture(reversed = false): CircuitProject {
  return { ...createProject('firmware-proof'), components: [createComponent('arduino-uno', { x: 0, y: 0 }, 'uno'),
    createComponent('esp8266', { x: 0, y: 0 }, 'esp'), createComponent('resistor', { x: 0, y: 0 }, 'r'),
    createComponent('led', { x: 0, y: 0 }, 'led')], wires: [
      wire('out', 'uno', 'D13', 'r', '1'), wire('led', 'r', '2', 'led', reversed ? 'cathode' : 'anode'),
      wire('return', 'led', reversed ? 'anode' : 'cathode', 'uno', 'GND'),
    ], programs: [] };
}
const run = (componentId: string, source: string) => ({ type: 'firmware-run' as const, componentId, source });
const advance = (elapsedMs: number) => ({ type: 'firmware-advance' as const, elapsedMs });
describe('source execution through the shared electrical circuit', () => {
  it('runs the user blink sketch: t0 HIGH, t1000 LOW, t2000 HIGH with independently calculated current', () => {
    const doc = fixture(), before = serializeProject(doc);
    let state = transitionSimulation(initialSimulation(), run('uno', blink()), doc);
    expect(state.firmware.uno?.error).toBeNull();
    expect(state.snapshot?.components.led?.current).toBeCloseTo((5 - 2) / (330 + 40), 10);
    expect(state.snapshot?.components.led?.brightness).toBeGreaterThan(0);
    expect(nextFirmwareDelay(state)).toBe(1000);
    state = transitionSimulation(state, advance(999), doc);
    expect(state.snapshot?.components.led?.brightness).toBeGreaterThan(0);
    state = transitionSimulation(state, advance(1), doc);
    expect(state.snapshot?.components.led?.brightness).toBe(0);
    state = transitionSimulation(state, advance(1000), doc);
    expect(state.snapshot?.components.led?.brightness).toBeGreaterThan(0);
    expect(serializeProject(doc)).toBe(before);
  });
  it.each(['unwired', 'reversed'] as const)('does not illuminate an %s LED when firmware drives HIGH', (kind) => {
    const doc = fixture(kind === 'reversed');
    if (kind === 'unwired') doc.wires = [];
    const state = transitionSimulation(initialSimulation(), run('uno', blink()), doc);
    expect(state.inputs.gpio?.[pinKey('uno', 'D13')]?.level).toBe('HIGH');
    expect(state.snapshot?.components.led?.brightness).toBe(0);
  });
  it('keeps UNO and ESP8266 programs and virtual timing independent', () => {
    const doc = fixture();
    let state = transitionSimulation(initialSimulation(), run('uno', blink()), doc);
    state = transitionSimulation(state, run('esp', blink('D1', 250)), doc);
    expect(state.snapshot?.pins[pinKey('uno', 'D13')]?.voltage).toBeCloseTo(5 - (3 / 370) * 40);
    expect(state.snapshot?.pins[pinKey('esp', 'D1')]?.voltage).toBeCloseTo(3.3);
    state = transitionSimulation(state, advance(250), doc);
    expect(state.inputs.gpio?.[pinKey('esp', 'D1')]?.level).toBe('LOW');
    expect(state.inputs.gpio?.[pinKey('uno', 'D13')]?.level).toBe('HIGH');
    const esp = state.firmware.esp;
    state = transitionSimulation(state, { type: 'firmware-stop', componentId: 'uno' }, doc);
    expect(state.firmware.esp).toBe(esp);
    expect(state.firmware.uno).toBeUndefined();
    expect(state.snapshot?.components.led?.brightness).toBe(0);
  });
  it('evaluates electrical interaction between wired boards instead of isolated GPIO stories', () => {
    const doc = fixture();
    doc.wires = [wire('gnd', 'uno', 'GND', 'esp', 'GND'), wire('shared', 'uno', 'D13', 'esp', 'D1')];
    let state = transitionSimulation(initialSimulation(), run('uno', blink()), doc);
    state = transitionSimulation(state, run('esp', blink('D1', 250)), doc);
    // 5 V/40Ω and 3.3 V/50Ω drive the same node. Kirchhoff: weighted voltage = 4.244444 V.
    const expected = (5 / 40 + 3.3 / 50) / (1 / 40 + 1 / 50);
    expect(state.snapshot?.pins[pinKey('esp', 'D1')]?.voltage).toBeCloseTo(expected, 8);
    expect(state.snapshot?.diagnostics.some((issue) => issue.code === 'gpio-overvoltage')).toBe(true);
    state = transitionSimulation(state, advance(250), doc);
    // ESP now LOW: both output drive resistances still participate in the shared circuit.
    expect(state.snapshot?.pins[pinKey('esp', 'D1')]?.voltage).toBeCloseTo((5 / 40) / (1 / 40 + 1 / 50), 8);
  });
  it('pauses both programs, resumes deterministic time and clears runtime on reset', () => {
    const doc = fixture();
    let state = transitionSimulation(initialSimulation(), run('uno', blink()), doc);
    state = transitionSimulation(state, { type: 'pause' }, doc);
    const paused = state;
    expect(transitionSimulation(state, advance(1000), doc)).toBe(paused);
    expect(nextFirmwareDelay(state)).toBeNull();
    state = transitionSimulation(state, { type: 'start' }, doc);
    state = transitionSimulation(state, advance(1000), doc);
    expect(state.snapshot?.components.led?.brightness).toBe(0);
    expect(transitionSimulation(state, { type: 'reset' }, doc)).toEqual(initialSimulation());
  });
  it('rejects unsupported C++, WiFi and UART visibly without replacing other board programs', () => {
    const doc = fixture();
    let state = transitionSimulation(initialSimulation(), run('uno', blink()), doc);
    const uno = state.firmware.uno;
    state = transitionSimulation(state, run('esp', 'void setup(){Serial.begin(9600);} void loop(){}'), doc);
    expect(state.firmware.esp?.error).toBe('unsupported-syntax');
    expect(state.firmware.uno).toBe(uno);
    expect(state.snapshot?.components.led?.brightness).toBeGreaterThan(0);
  });
});
