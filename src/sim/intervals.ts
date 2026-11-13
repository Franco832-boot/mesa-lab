import type { CircuitProject, GpioState } from '../model/types';
import type { ComponentInterval, ComponentResult, ElectricalSnapshot, SimulationInputs, SimulationIssue } from './types';
import { validateInputs } from './inputs';

type Evaluate = (project: CircuitProject, inputs: SimulationInputs) => ElectricalSnapshot;
interface WeightedSnapshot { snapshot: ElectricalSnapshot; durationUs: number }
export interface GpioChange { atUs: number; key: string; state: GpioState }

export function pwmPeriod(inputs: SimulationInputs): number {
  const periods = new Set(Object.values(inputs.gpio ?? {}).flatMap((state) => state.pwm ? [state.pwm.periodUs] : []));
  return periods.size === 0 ? 0 : periods.size === 1 ? [...periods][0] ?? 0 : 261120;
}

/** Default timers run continuously; writing a duty does not restart their phase. */
export function samplePwm(inputs: SimulationInputs, timeUs: number): SimulationInputs {
  if (!pwmPeriod(inputs)) return inputs;
  return { ...inputs, gpio: Object.fromEntries(Object.entries(inputs.gpio ?? {}).map(([key, state]) => {
    if (!state.pwm) return [key, state];
    const phase = ((timeUs % state.pwm.periodUs) + state.pwm.periodUs) % state.pwm.periodUs;
    return [key, { mode: state.mode, level: phase < state.pwm.periodUs * state.pwm.value / 255 ? 'HIGH' : 'LOW' }];
  })) };
}

export function combineDiagnostics(snapshots: readonly ElectricalSnapshot[]): SimulationIssue[] {
  const unique = new Map<string, SimulationIssue>();
  for (const snapshot of snapshots) for (const issue of snapshot.diagnostics) unique.set(JSON.stringify(issue), issue);
  return [...unique.values()];
}

/** Undefined readings stay undefined. In particular, high impedance is not 0 V. */
function summarize(samples: readonly WeightedSnapshot[]): ElectricalSnapshot {
  const last = samples.at(-1)?.snapshot;
  if (!last) throw new Error('empty-electrical-interval');
  const durationUs = samples.reduce((sum, sample) => sum + sample.durationUs, 0);
  const components: Record<string, ComponentResult> = {};
  const intervals: Record<string, ComponentInterval> = {};
  const rank = { normal: 0, active: 1, warning: 2, overheated: 3, damaged: 4 } as const;
  for (const [id, final] of Object.entries(last.components)) {
    const result: ComponentResult = { ...final };
    const stats: ComponentInterval = { resolvedCharge: 0, resolvedCurrentUs: 0 };
    for (const field of ['voltage', 'current', 'power', 'brightness'] as const) {
      let total = 0, resolved = true;
      for (const sample of samples) {
        const value = sample.snapshot.components[id]?.[field];
        if (value === undefined) { resolved = false; break; }
        total += value * sample.durationUs;
      }
      if (resolved) result[field] = total / durationUs;
      else delete result[field];
    }
    if (result.voltage !== undefined) stats.meanVoltage = result.voltage;
    if (result.current !== undefined) stats.meanCurrent = result.current;
    if (result.power !== undefined) stats.meanPower = result.power;
    let signedSpeed = 0, drivenUs = 0;
    for (const sample of samples) {
      const state = sample.snapshot.components[id];
      if (!state) continue;
      if (rank[state.condition] > rank[result.condition]) result.condition = state.condition;
      const prior = sample.snapshot.interval?.components[id];
      const peak = state.peakCurrent ?? (state.current === undefined ? undefined : Math.abs(state.current));
      if (peak !== undefined) stats.peakCurrent = Math.max(stats.peakCurrent ?? 0, peak);
      if (prior && sample.snapshot.interval) {
        const fraction = sample.durationUs / sample.snapshot.interval.durationUs;
        stats.resolvedCharge += prior.resolvedCharge * fraction;
        stats.resolvedCurrentUs += prior.resolvedCurrentUs * fraction;
      } else if (state.current !== undefined) {
        stats.resolvedCharge += Math.abs(state.current) * sample.durationUs / 1e6;
        stats.resolvedCurrentUs += sample.durationUs;
      }
      if (state.motor) {
        const sign = state.motor.direction === 'forward' ? 1 : state.motor.direction === 'reverse' ? -1 : 0;
        signedSpeed += sign * (state.motor.speed ?? 0) * sample.durationUs;
        drivenUs += (state.motor.drivenFraction ?? (sign ? 1 : 0)) * sample.durationUs;
        // Retain the electrically driven bridge state for an averaged PWM view.
      }
      if (state.bridge) result.bridge = state.bridge.map((channel, index) => channel === 'disabled' ? result.bridge?.[index] ?? channel : channel);
    }
    if (stats.peakCurrent !== undefined) result.peakCurrent = stats.peakCurrent;
    if (final.motor && drivenUs > 0) result.motor = {
      direction: Math.abs(signedSpeed) < 1e-10 ? 'stopped' : signedSpeed > 0 ? 'forward' : 'reverse',
      speed: Math.abs(signedSpeed) / durationUs, drivenFraction: drivenUs / durationUs,
    };
    components[id] = result;
    intervals[id] = stats;
  }
  const pins = Object.fromEntries(Object.entries(last.pins).map(([key, final]) => {
    const all = samples.map((sample) => sample.snapshot.pins[key]);
    const voltage = all.every((pin) => pin?.voltage !== undefined)
      ? samples.reduce((sum, sample) => sum + (sample.snapshot.pins[key]?.voltage ?? 0) * sample.durationUs, 0) / durationUs : undefined;
    const logic = all.every((pin) => pin?.logic === final.logic) ? final.logic : 'UNDEFINED';
    return [key, { ...(voltage === undefined ? {} : { voltage }), logic }];
  }));
  return { pins, components, diagnostics: combineDiagnostics(samples.map((sample) => sample.snapshot)), interval: { durationUs, components: intervals } };
}

/** Solve every distinct electrical state, with exact duration weights. Full
 * repeating timer periods are compressed, never sampled or skipped. */
export function evaluatePwmWindow(project: CircuitProject, inputs: SimulationInputs, startUs: number, durationUs: number, evaluate: Evaluate): ElectricalSnapshot {
  if (validateInputs(project, inputs).length) return evaluate(project, inputs);
  if (durationUs <= 0) return evaluate(project, samplePwm(inputs, startUs));
  const period = pwmPeriod(inputs);
  if (!period) return summarize([{ snapshot: evaluate(project, inputs), durationUs }]);
  const samples: WeightedSnapshot[] = [];
  const cache = new Map<string, ElectricalSnapshot>();
  const collect = (start: number, duration: number, multiplier: number) => {
    const end = start + duration;
    const boundaries = new Set([start, end]);
    for (const state of Object.values(inputs.gpio ?? {})) if (state.pwm) {
      const { periodUs, value } = state.pwm;
      for (let cycle = Math.floor(start / periodUs); cycle * periodUs < end; cycle++) {
        for (const edge of [cycle * periodUs, cycle * periodUs + periodUs * value / 255]) {
          if (edge > start && edge < end) boundaries.add(edge);
        }
      }
    }
    const ordered = [...boundaries].sort((a, b) => a - b);
    for (let index = 1; index < ordered.length; index++) {
      const a = ordered[index - 1], b = ordered[index];
      if (a === undefined || b === undefined || b <= a) continue;
      const sampled = samplePwm(inputs, (a + b) / 2);
      const key = JSON.stringify(sampled.gpio);
      let snapshot = cache.get(key);
      if (!snapshot) { snapshot = evaluate(project, sampled); cache.set(key, snapshot); }
      samples.push({ snapshot, durationUs: (b - a) * multiplier });
    }
  };
  const cycles = Math.floor(durationUs / period);
  if (cycles) collect(startUs, period, cycles);
  const remaining = durationUs - cycles * period;
  if (remaining > 0) collect(startUs + cycles * period, remaining, 1);
  return summarize(samples);
}

/** Include pulses and faults before the final GPIO latch, including ordinary
 * digital writes. The public snapshot displays the endpoint operating state;
 * interval statistics describe the actual elapsed window. */
export function evaluateTimeline(project: CircuitProject, initial: SimulationInputs, changes: readonly GpioChange[], startUs: number, endUs: number, dc: Evaluate, endpoint: Evaluate) {
  let inputs = initial, cursor = startUs;
  const samples: WeightedSnapshot[] = [];
  for (const change of [...changes].sort((a, b) => a.atUs - b.atUs)) {
    const at = Math.max(cursor, Math.min(endUs, change.atUs));
    if (at > cursor) samples.push({ snapshot: evaluatePwmWindow(project, inputs, cursor, at - cursor, dc), durationUs: at - cursor });
    inputs = { ...inputs, gpio: { ...inputs.gpio, [change.key]: change.state } };
    cursor = at;
  }
  if (endUs > cursor) samples.push({ snapshot: evaluatePwmWindow(project, inputs, cursor, endUs - cursor, dc), durationUs: endUs - cursor });
  const final = endpoint(project, inputs);
  if (!samples.length) return { inputs, snapshot: final };
  const history = summarize(samples);
  const components = Object.fromEntries(Object.entries(final.components).map(([id, result]) => {
    const peakCurrent = history.components[id]?.peakCurrent;
    return [id, { ...result, ...(peakCurrent === undefined ? {} : { peakCurrent }) }];
  }));
  return { inputs, snapshot: { ...final, components, ...(history.interval ? { interval: history.interval } : {}), diagnostics: combineDiagnostics([history, final]) } };
}
