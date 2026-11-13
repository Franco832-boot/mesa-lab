import { describe, expect, it } from 'vitest';
import { motorFixture, motorInputs, motorWire } from '../test/motorFixture';
import { evaluateCircuit, evaluateCircuitAt, evaluateCircuitTimeline } from './engine';
import { pinKey } from './topology';

const control = pinKey('uno', 'D9');
function inputs(value = 128) {
  const base = motorInputs();
  return { ...base, gpio: { ...base.gpio, [control]: { mode: 'output' as const, level: 'HIGH' as const, pwm: { value, periodUs: 2040 } } } };
}
// Independent Kirchhoff calculation: battery 2 Ω and 100k standby, motor
// 100 Ω, source 7/3 Ω and sink 2 Ω. LOW/LOW connects the motor to ground.
const peak = (9 / (1 + 2 * (1 / (100 + 13 / 3) + 1 / 100000))) / (100 + 13 / 3);
describe('electrical PWM intervals', () => {
  it('integrates switched states, preserving peak current instead of solving a mean GPIO voltage', () => {
    const result = evaluateCircuit(motorFixture(), inputs());
    expect(result.diagnostics).toEqual([]);
    expect(result.components.motor?.current).toBeCloseTo(peak * 128 / 255, 10);
    expect(result.components.motor?.voltage).toBeCloseTo(100 * peak * 128 / 255, 10);
    expect(result.components.motor?.peakCurrent).toBeCloseTo(peak, 10);
    expect(result.components.motor?.power).toBeCloseTo(100 * peak ** 2 * 128 / 255, 10);
    expect(result.components.motor?.motor?.drivenFraction).toBeCloseTo(128 / 255, 10);
    expect(result.components.motor?.motor?.speed).toBeCloseTo(100 * peak / 9 * 128 / 255, 10);
  });
  it('observes actual HIGH and LOW portions at read time', () => {
    expect(evaluateCircuitAt(motorFixture(), inputs(), 0).components.motor?.motor?.direction).toBe('forward');
    expect(evaluateCircuitAt(motorFixture(), inputs(), 1500).components.motor?.motor?.direction).toBe('stopped');
  });
  it('integrates partial periods and is invariant under time partitioning', () => {
    const project = motorFixture(), signal = inputs();
    const whole = evaluateCircuitTimeline(project, signal, [], 0, 10000).snapshot.interval?.components.motor;
    const left = evaluateCircuitTimeline(project, signal, [], 0, 1700).snapshot.interval?.components.motor;
    const right = evaluateCircuitTimeline(project, signal, [], 1700, 10000).snapshot.interval?.components.motor;
    // Four complete periods plus 1840 us; all five HIGH portions fit.
    expect(whole?.resolvedCharge).toBeCloseTo(peak * (5 * 2040 * 128 / 255) / 1e6, 12);
    expect(whole?.resolvedCharge).toBeCloseTo((left?.resolvedCharge ?? 0) + (right?.resolvedCharge ?? 0), 12);
    expect(whole?.resolvedCurrentUs).toBe(10000);
  });
  it('preserves short-circuit warnings from a tiny pulse even when the window ends LOW', () => {
    const project = motorFixture();
    project.wires.push(motorWire('short', 'bridge', 'OUT1', 'bridge', 'OUT2'));
    const result = evaluateCircuitTimeline(project, inputs(1), [], 0, 2040).snapshot;
    expect(result.diagnostics.map((issue) => issue.code)).toEqual(expect.arrayContaining(['driver-overcurrent', 'short-circuit']));
    expect(result.interval?.components.battery?.peakCurrent).toBeGreaterThan(1);
  });
  it('retains intermediate digital pulses and their charge when the final latch is LOW', () => {
    const base = motorInputs(true, false, false);
    const result = evaluateCircuitTimeline(motorFixture(), base, [
      { atUs: 100, key: control, state: { mode: 'output', level: 'HIGH' } },
      { atUs: 350, key: control, state: { mode: 'output', level: 'LOW' } },
    ], 0, 1000).snapshot;
    expect(result.components.motor?.motor?.direction).toBe('stopped');
    expect(result.interval?.components.motor?.resolvedCharge).toBeCloseTo(peak * .00025, 12);
    expect(result.interval?.components.motor?.peakCurrent).toBeCloseTo(peak, 10);
  });
  it('does not invent a mean current when an enable pulse leaves an indeterminate floating output', () => {
    const project = motorFixture();
    for (const wire of project.wires) {
      if (wire.id === 'enable') wire.from.pinId = 'D9';
      if (wire.id === 'in1') wire.from.pinId = 'D8';
    }
    const result = evaluateCircuit(project, inputs());
    expect(result.components.motor?.current).toBeUndefined();
    expect(result.components.motor?.peakCurrent).toBeCloseTo(peak, 10);
    expect(result.components.motor?.motor?.speed).toBeCloseTo(100 * peak / 9 * 128 / 255, 10);
  });
  it('rejects malformed timer inputs without attempting unbounded interval enumeration', () => {
    const invalid = inputs();
    const state = invalid.gpio[control];
    if (!state?.pwm) throw new Error('Missing test PWM');
    state.pwm.periodUs = 0;
    expect(evaluateCircuit(motorFixture(), invalid).diagnostics.some((issue) => issue.code === 'invalid-input')).toBe(true);
  });
});
