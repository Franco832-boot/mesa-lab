import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createComponent } from '../../model/components';
import { createProject, serializeProject } from '../../model/project';
import { pinKey } from '../../sim/topology';
import type { CircuitProject } from '../../model/types';
import { initialSimulation, transitionSimulation } from './runtime';
import { nextFirmwareDelay, nextFirmwareSlice } from './firmwareRuntime';
import type { SimulationState } from './runtime';

const blink = (pin = '13', period = 1000) => `void setup(){pinMode(${pin}, OUTPUT);} void loop(){digitalWrite(${pin}, HIGH);delay(${period});digitalWrite(${pin}, LOW);delay(${period});}`;
const delayedModeFailure = 'void setup(){pinMode(13,OUTPUT);digitalWrite(13,HIGH);pinMode(A5,OUTPUT);digitalWrite(A5,HIGH);}void loop(){delay(10);digitalWrite(12,HIGH);}';
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
const millisBlink = readFileSync(new URL('../../../examples/arduino/blink-without-delay.ino', import.meta.url), 'utf8');
function advanceTo(state: SimulationState, elapsedMs: number, doc: CircuitProject): SimulationState {
  let next = transitionSimulation(state, advance(elapsedMs), doc);
  for (let slices = 0; nextFirmwareDelay(next) === 0; slices++) {
    if (slices > 10000) throw new Error('Pending advance did not complete');
    next = transitionSimulation(next, advance(0), doc);
  }
  return next;
}
describe('source execution through the shared electrical circuit', () => {
  it('never rounds a short explicit delay to the polling frame, including mixed boards', () => {
    const doc = fixture();
    let state = transitionSimulation(initialSimulation(), run('uno', blink('13', 10)), doc);
    expect(nextFirmwareSlice(state)).toEqual({ waitMs: 10, elapsedMs: 10 });
    state = transitionSimulation(state, run('esp', millisBlink.replace('LED_BUILTIN', 'D1')), doc);
    expect(nextFirmwareSlice(state)).toEqual({ waitMs: 10, elapsedMs: 10 });
    state = advanceTo(state, 10, doc);
    expect(state.snapshot?.components.led?.brightness).toBe(0);
    expect(nextFirmwareSlice(state)).toEqual({ waitMs: 10, elapsedMs: 10 });
  });
  it('runs millis Blink through the solver, preserving independent boards, pause and persisted project data', () => {
    const doc = fixture(), saved = serializeProject(doc);
    let state = transitionSimulation(initialSimulation(), run('uno', millisBlink), doc);
    state = transitionSimulation(state, run('esp', blink('D1', 250)), doc);
    expect(state.snapshot?.components.led?.brightness).toBe(0);
    expect(nextFirmwareSlice(state)).toEqual({ waitMs: 16, elapsedMs: 16 });
    state = advanceTo(state, 999, doc);
    expect(state.snapshot?.components.led?.brightness).toBe(0);
    state = advanceTo(state, 1, doc);
    expect(state.snapshot?.components.led?.current).toBeCloseTo(3 / 370, 10);
    expect(state.snapshot?.components.led?.brightness).toBeCloseTo((3 / 370) / 0.02, 10);
    expect(state.inputs.gpio?.[pinKey('esp', 'D1')]?.level).toBe('HIGH');
    state = transitionSimulation(state, { type: 'pause' }, doc);
    expect(transitionSimulation(state, advance(9999), doc)).toBe(state);
    expect(nextFirmwareSlice(state)).toBeNull();
    state = transitionSimulation(state, { type: 'start' }, doc);
    state = advanceTo(state, 1000, doc);
    expect(state.snapshot?.components.led?.brightness).toBe(0);
    const esp = state.firmware.esp;
    state = transitionSimulation(state, { type: 'firmware-stop', componentId: 'uno' }, doc);
    expect(state.firmware.esp).toBe(esp);
    expect(state.inputs.gpio?.[pinKey('uno', 'D13')]).toBeUndefined();
    expect(serializeProject(doc)).toBe(saved);
    expect(transitionSimulation(state, { type: 'reset' }, doc)).toEqual(initialSimulation());
  });
  it.each(['reversed', 'unwired'] as const)('keeps a %s LED dark even when millis code drives HIGH', (kind) => {
    const doc = fixture(kind === 'reversed');
    if (kind === 'unwired') doc.wires = [];
    const state = advanceTo(transitionSimulation(initialSimulation(), run('uno', millisBlink), doc), 1000, doc);
    expect(state.inputs.gpio?.[pinKey('uno', 'D13')]?.level).toBe('HIGH');
    expect(state.snapshot?.components.led?.brightness).toBe(0);
  });
  it('bounds combined board work and drains the same target without starving a neighboring board', () => {
    const doc = fixture();
    let state = transitionSimulation(initialSimulation(), run('uno', millisBlink), doc);
    state = transitionSimulation(state, run('esp', blink('D1', 250)), doc);
    state = transitionSimulation(state, advance(1000), doc);
    expect(state.firmware.uno?.execution?.pendingUntilUs).toBe(1000000);
    expect(state.firmware.esp?.execution?.timeMs).toBe(1000);
    expect(nextFirmwareSlice(state)).toEqual({ waitMs: 1, elapsedMs: 0 });
    state = advanceTo(state, 0, doc);
    expect(state.firmware.uno?.execution?.timeMs).toBe(1000);
    expect(state.firmware.esp?.execution?.timeMs).toBe(1000);
    expect(state.snapshot?.components.led?.current).toBeCloseTo(3 / 370, 10);
  });
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
  it.each([
    { error: 'pin-not-output', source: delayedModeFailure },
    { error: 'arithmetic-error', source: 'int zero=0;void setup(){pinMode(13,OUTPUT);digitalWrite(13,HIGH);pinMode(A5,OUTPUT);digitalWrite(A5,HIGH);delay(10);}void loop(){zero=1/zero;}' },
  ])('releases active outputs and recalculates the circuit after a delayed $error', ({ error, source }) => {
    const doc = fixture(), documentBefore = serializeProject(doc);
    let state = transitionSimulation(initialSimulation(), run('uno', source), doc);
    expect(state.firmware.uno?.error).toBeNull();
    expect(state.inputs.gpio?.[pinKey('uno', 'A5')]).toEqual({ mode: 'output', level: 'HIGH' });
    expect(state.snapshot?.components.led?.current).toBeCloseTo(3 / 370, 10);
    const initialSnapshot = state.snapshot;
    state = transitionSimulation(state, advance(9), doc);
    expect(state.snapshot).toBe(initialSnapshot);
    const beforeFailure = state;
    state = transitionSimulation(state, advance(1), doc);
    expect(state.firmware.uno).toMatchObject({ source, execution: null, error });
    expect(state.inputs.gpio).toEqual({});
    expect(state.snapshot).not.toBe(initialSnapshot);
    expect(state.snapshot?.components.led?.current).toBe(0);
    expect(state.snapshot?.components.led?.brightness).toBe(0);
    expect(state.snapshot?.pins[pinKey('uno', '5V')]?.voltage).toBeCloseTo(5, 10);
    expect(state.status).toBe('running');
    expect(nextFirmwareDelay(state)).toBeNull();
    expect(transitionSimulation(state, advance(1000), doc)).toBe(state);
    expect(beforeFailure.inputs.gpio?.[pinKey('uno', 'D13')]).toEqual({ mode: 'output', level: 'HIGH' });
    expect(beforeFailure.snapshot?.components.led?.current).toBeCloseTo(3 / 370, 10);
    expect(serializeProject(doc)).toBe(documentBefore);
  });
  it.each(['uno', 'other'] as const)('isolates a delayed failure from another UNO and an independent supply when %s starts first', (first) => {
    const doc = fixture();
    doc.components.push(
      createComponent('arduino-uno', { x: 0, y: 0 }, 'other'),
      createComponent('resistor', { x: 0, y: 0 }, 'other-r'),
      createComponent('led', { x: 0, y: 0 }, 'other-led'),
      createComponent('power-supply', { x: 0, y: 0 }, 'supply'),
      createComponent('resistor', { x: 0, y: 0 }, 'supply-r'),
      createComponent('led', { x: 0, y: 0 }, 'supply-led'),
    );
    doc.wires.push(
      wire('other-out', 'other', 'D13', 'other-r', '1'),
      wire('other-led', 'other-r', '2', 'other-led', 'anode'),
      wire('other-return', 'other-led', 'cathode', 'other', 'GND'),
      wire('supply-out', 'supply', 'positive', 'supply-r', '1'),
      wire('supply-led', 'supply-r', '2', 'supply-led', 'anode'),
      wire('supply-return', 'supply-led', 'cathode', 'supply', 'negative'),
    );
    const documentBefore = serializeProject(doc);
    let state = initialSimulation();
    for (const id of first === 'uno' ? ['uno', 'other'] : ['other', 'uno']) {
      state = transitionSimulation(state, run(id, id === 'uno' ? delayedModeFailure : blink('13', 10)), doc);
    }
    expect(state.snapshot?.components['other-led']?.current).toBeCloseTo(3 / 370, 10);
    expect(state.snapshot?.components['supply-led']?.current).toBeCloseTo(3 / 330, 10);
    const beforeFailure = state;
    state = transitionSimulation(state, advance(10), doc);
    expect(state.firmware.uno?.error).toBe('pin-not-output');
    expect(state.inputs.gpio?.[pinKey('uno', 'D13')]).toBeUndefined();
    expect(state.inputs.gpio?.[pinKey('uno', 'A5')]).toBeUndefined();
    expect(state.inputs.gpio?.[pinKey('other', 'D13')]).toEqual({ mode: 'output', level: 'LOW' });
    expect(state.firmware.other?.error).toBeNull();
    expect(state.firmware.other?.execution?.timeMs).toBe(10);
    expect(state.snapshot?.components.led?.brightness).toBe(0);
    expect(state.snapshot?.components['other-led']?.current).toBe(0);
    expect(state.snapshot?.components['supply-led']?.current).toBeCloseTo(3 / 330, 10);
    expect(state.virtualNetwork).toBe(beforeFailure.virtualNetwork);
    expect(state.status).toBe('running');
    expect(nextFirmwareDelay(state)).toBe(10);
    state = transitionSimulation(state, advance(10), doc);
    expect(state.inputs.gpio?.[pinKey('uno', 'D13')]).toBeUndefined();
    expect(state.inputs.gpio?.[pinKey('other', 'D13')]).toEqual({ mode: 'output', level: 'HIGH' });
    expect(state.snapshot?.components['other-led']?.current).toBeCloseTo(3 / 370, 10);
    expect(state.snapshot?.components['supply-led']?.current).toBeCloseTo(3 / 330, 10);
    expect(serializeProject(doc)).toBe(documentBefore);
  });
  it('releases a failed UNO output to high impedance while preserving an externally driven shared node', () => {
    const doc = fixture();
    doc.wires = [wire('gnd', 'uno', 'GND', 'esp', 'GND'), wire('shared', 'uno', 'D13', 'esp', 'D1')];
    let state = transitionSimulation(initialSimulation(), run('uno', delayedModeFailure), doc);
    state = transitionSimulation(state, run('esp', blink('D1')), doc);
    expect(state.snapshot?.pins[pinKey('uno', 'D13')]?.voltage).toBeCloseTo((5 / 40 + 3.3 / 50) / (1 / 40 + 1 / 50), 8);
    const otherGpio = state.inputs.gpio?.[pinKey('esp', 'D1')];
    state = transitionSimulation(state, advance(10), doc);
    expect(state.firmware.uno?.error).toBe('pin-not-output');
    expect(state.inputs.gpio?.[pinKey('uno', 'D13')]).toBeUndefined();
    expect(state.inputs.gpio?.[pinKey('esp', 'D1')]).toBe(otherGpio);
    expect(state.firmware.esp?.error).toBeNull();
    expect(state.snapshot?.pins[pinKey('uno', 'D13')]?.voltage).toBeCloseTo(3.3, 10);
    expect(state.snapshot?.pins[pinKey('esp', 'D1')]?.voltage).toBeCloseTo(3.3, 10);
    expect(nextFirmwareDelay(state)).toBe(990);
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
    state = transitionSimulation(state, run('esp', 'void setup(){Serial.notSupported();} void loop(){}'), doc);
    expect(state.firmware.esp?.error).toBe('unsupported-syntax');
    expect(state.firmware.uno).toBe(uno);
    expect(state.snapshot?.components.led?.brightness).toBeGreaterThan(0);
  });
});
