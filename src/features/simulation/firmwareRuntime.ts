import { enqueueTelegram } from '../../firmware/telegram';
import type { VirtualWifiNetwork } from '../../firmware/wifi';
import type { SerialState } from '../../firmware/serial';
import { compileProjectFiles } from '../../firmware/projectCompiler';
import { initialExecution } from '../../firmware/machine';
import { requestFirmwareHttp } from '../../firmware/http';
import type { HttpResponse } from '../../firmware/http';
import type { SourceFile } from '../../model/types';
import { resolveI2cLcd, writeI2cLcd } from '../../sim/lcdI2c';
import type { I2cLcdTarget } from '../../sim/lcdI2c';
import { resolveParallelLcd, writeParallelLcd } from '../../sim/lcdTransport';
import type { CircuitProject, GpioState } from '../../model/types';
import { componentDefinitions } from '../../model/components';
import {
  advanceArduino,
  createArduinoExecution,
  MAX_ADVANCE_STEPS,
  UnoExecutionError,
} from '../../firmware/uno';
import type { UnoErrorCode, UnoExecution } from '../../firmware/uno';
import type { SourceSpan } from '../../firmware/errors';
import { evaluateCircuit, evaluateCircuitAt, evaluateCircuitTimeline } from '../../sim/engine';
import type { GpioChange } from '../../sim/intervals';
import { pwmPeriod } from '../../sim/intervals';
import { ownInput, pinKey } from '../../sim/topology';
import type { SimulationInputs } from '../../sim/types';
import type { SimulationState } from './runtime';
import type { FirmwareHost } from '../../firmware/ports';
import { observeDht11 } from '../../sim/dht11';
import type { DhtObservation } from '../../model/dht11';

interface CircuitHost extends FirmwareHost { currentInputs(): SimulationInputs }
function circuitHost(project: CircuitProject, initialInputs: SimulationInputs, boardId: string, wifiNetwork?: VirtualWifiNetwork, startedAtUs = 0): CircuitHost {
  let inputs = initialInputs;
  let signature: string | null = null, observation: DhtObservation | null = null;
  const targets = new Map<string, string | null>();
  const i2cTargets = new Map<string, I2cLcdTarget | null>();
  const applyPending = (pendingGpio: readonly { pinId: string; state: GpioState }[]) => {
    const gpio = { ...inputs.gpio };
    for (const event of pendingGpio) gpio[pinKey(boardId, event.pinId)] = event.state;
    return { ...inputs, gpio };
  };
  return { ...(wifiNetwork ? { wifiNetwork } : {}), currentInputs: () => inputs, readDigital: (pinId, pendingGpio, timeUs) => {
    const reading = evaluateCircuitAt(project, applyPending(pendingGpio), startedAtUs + timeUs).pins[pinKey(boardId, pinId)];
    return reading?.logic === 'HIGH' ? 1 : reading?.logic === 'LOW' ? 0 : null;
  }, observeDht: (pinId, _timeUs, pendingGpio) => {
    const next = `${pinId}:${pendingGpio.length}`;
    if (next === signature) return observation;
    observation = observeDht11(project, applyPending(pendingGpio), boardId, pinId);
    signature = next; return observation;
  }, writeLcd: (bus, operation, pendingGpio) => {
    const current = applyPending(pendingGpio);
    const key = JSON.stringify([bus, current.gpio, Object.entries(current.pcf8574 ?? {}).map(([id, latch]) => [id, latch & 8])]);
    if (bus.kind === 'parallel') {
      if (!targets.has(key)) targets.set(key, resolveParallelLcd(project, current, boardId, bus));
      const target = targets.get(key);
      if (target) inputs = writeParallelLcd(inputs, target, bus, operation);
    } else {
      if (!i2cTargets.has(key)) i2cTargets.set(key, resolveI2cLcd(project, current, boardId, bus));
      const target = i2cTargets.get(key);
      if (target) inputs = writeI2cLcd(inputs, target, bus, operation);
    }
    signature = null;
  } };
}

export interface FirmwareSession { readonly kind: 'firmware-session' }
export interface BoardExecution {
  startedAtUs?: number;
  wifiNetwork?: VirtualWifiNetwork;
  session?: FirmwareSession;
  serial?: SerialState;
  files?: readonly SourceFile[];
  httpResponse?: HttpResponse;
  source: string;
  execution: UnoExecution | null;
  error: UnoErrorCode | null;
  location?: SourceSpan | null;
}
export type FirmwareState = Readonly<Record<string, BoardExecution>>;
export type FirmwareEvent =
  | { type: 'firmware-chat'; componentId: string; chatId: string; text: string }
  | { type: 'firmware-clear-serial'; componentId: string }
  | { type: 'firmware-http'; componentId: string; path: string; session?: FirmwareSession }
  | { type: 'firmware-run'; componentId: string; source: string; wifiNetwork?: VirtualWifiNetwork }
  | { type: 'firmware-stop'; componentId: string }
  | { type: 'firmware-advance'; elapsedMs: number };

function clearBoardInputs(
  inputs: SimulationInputs,
  project: CircuitProject,
  id: string,
): SimulationInputs {
  const component = project.components.find((item) => item.id === id);
  if (!component) return inputs;
  const keys = new Set(componentDefinitions[component.kind].pins.map((pin) => pinKey(id, pin.id)));
  return {
    ...inputs,
    gpio: Object.fromEntries(Object.entries(inputs.gpio ?? {}).filter(([key]) => !keys.has(key))),
  };
}
function failure(error: unknown): { error: UnoErrorCode; location: SourceSpan | null; serial?: SerialState } {
  return error instanceof UnoExecutionError
    ? { error: error.code, location: error.location, ...(error.serial ? { serial: error.serial } : {}) }
    : { error: 'unsupported-syntax', location: null };
}
/** Runs actual parsed source; GPIO events enter the ordinary electrical inputs. */
export function transitionFirmware(
  previous: SimulationState,
  event: FirmwareEvent,
  project: CircuitProject,
): SimulationState {
  if (event.type === 'firmware-chat') {
    const instance = ownInput(previous.firmware, event.componentId);
    const execution = instance?.execution;
    if (previous.status !== 'running' || !instance || !execution?.telegram) return previous;
    const telegram = enqueueTelegram(execution.telegram, event.chatId, event.text);
    if (telegram === execution.telegram) return previous;
    return { ...previous, firmware: { ...previous.firmware, [event.componentId]: {
      ...instance, execution: { ...execution, telegram },
    } } };
  }
  if (event.type === 'firmware-clear-serial') {
    const instance = ownInput(previous.firmware, event.componentId);
    const serial = instance?.execution?.serial ?? instance?.serial;
    if (!instance || !serial) return previous;
    const cleared = { ...serial, output: '', truncated: false };
    return { ...previous, firmware: { ...previous.firmware, [event.componentId]: {
      ...instance, serial: cleared, ...(instance.execution ? { execution: { ...instance.execution, serial: cleared } } : {}),
    } } };
  }
  if (event.type === 'firmware-http') {
    const instance = ownInput(previous.firmware, event.componentId);
    if (!instance) return previous;
    let next = instance, inputs = previous.inputs;
    try {
      if (previous.status !== 'running' || !instance.execution || instance.error || (event.session && event.session !== instance.session)) {
        next = { ...instance, httpResponse: { status: 503, contentType: 'text/plain', body: '503' } };
      } else {
        const host = circuitHost(project, inputs, event.componentId, instance.wifiNetwork);
        const result = requestFirmwareHttp(instance.execution, instance.files ?? [], event.path, host);
        const gpio = { ...host.currentInputs().gpio };
        for (const output of result.gpio) gpio[pinKey(event.componentId, output.pinId)] = output.state;
        inputs = result.gpio.length ? { ...host.currentInputs(), gpio } : host.currentInputs();
        next = { ...instance, execution: result.execution, httpResponse: result.response };
      }
    } catch (error: unknown) {
      next = { ...instance, ...(instance.execution ? { serial: instance.execution.serial } : {}), execution: null, ...failure(error), httpResponse: { status: 500, contentType: 'text/plain', body: '500' } };
      inputs = clearBoardInputs(inputs, project, event.componentId);
    }
    return { ...previous, firmware: { ...previous.firmware, [event.componentId]: next }, inputs,
      snapshot: inputs === previous.inputs ? previous.snapshot : evaluateCircuit(project, inputs) };
  }
  if (event.type === 'firmware-stop') {
    if (!ownInput(previous.firmware, event.componentId)) return previous;
    const firmware = Object.fromEntries(
      Object.entries(previous.firmware).filter(([id]) => id !== event.componentId),
    );
    const inputs = clearBoardInputs(previous.inputs, project, event.componentId);
    return {
      ...previous,
      firmware,
      inputs,
      snapshot: previous.status === 'stopped' ? null : evaluateCircuit(project, inputs),
    };
  }
  if (event.type === 'firmware-run') {
    const board = project.components.find((item) => item.id === event.componentId);
    if (!board || (board.kind !== 'arduino-uno' && board.kind !== 'esp8266')) return previous;
    const inputs = clearBoardInputs(previous.inputs, project, board.id);
    try {
      const host = circuitHost(project, inputs, board.id, event.wifiNetwork, previous.timeUs);
      const program = project.programs.find((item) => item.componentId === board.id);
      const files = board.kind === 'esp8266' && program?.files
        ? program.files.map((file) => ({ ...file, source: file.name === 'main.ino' ? event.source : file.source }))
        : [{ name: 'main.ino', source: event.source }];
      const execution = board.kind === 'esp8266' ? initialExecution(compileProjectFiles(files, board.kind), files) : createArduinoExecution(event.source, board.kind);
      const initial = advanceArduino(execution, 0, MAX_ADVANCE_STEPS, host);
      const gpio = { ...host.currentInputs().gpio };
      for (const output of initial.gpio) gpio[pinKey(board.id, output.pinId)] = output.state;
      const nextInputs = { ...host.currentInputs(), gpio };
      return {
        ...previous,
        status: 'running',
        inputs: nextInputs,
        firmware: {
          ...previous.firmware,
          [board.id]: { startedAtUs: previous.timeUs, ...(event.wifiNetwork ? { wifiNetwork: { ...event.wifiNetwork } } : {}), session: { kind: 'firmware-session' }, files, source: event.source, execution: initial.execution, error: null },
        },
        snapshot: evaluateCircuit(project, nextInputs),
      };
    } catch (error: unknown) {
      return {
        ...previous,
        inputs,
        firmware: {
          ...previous.firmware,
          [board.id]: { source: event.source, execution: null, ...failure(error) },
        },
        snapshot: previous.status === 'stopped' ? null : evaluateCircuit(project, inputs),
      };
    }
  }
  if (previous.status !== 'running' || !Number.isFinite(event.elapsedMs) || event.elapsedMs < 0)
    return previous;
  const firmware: Record<string, BoardExecution> = { ...previous.firmware };
  let inputs = previous.inputs;
  const events: GpioChange[] = [...previous.pendingGpio];
  let changed = false;
  // Bound total interpreter work across all boards, including expression evaluation.
  const active = Object.values(previous.firmware).filter(
    (instance) => instance.execution && !instance.error,
  ).length;
  const budget = Math.max(1, Math.floor(MAX_ADVANCE_STEPS / Math.max(1, active)));
  for (const [id, instance] of Object.entries(previous.firmware)) {
    if (!instance.execution || instance.error) continue;
    try {
      const host = circuitHost(project, inputs, id, instance.wifiNetwork, instance.startedAtUs ?? 0);
      const advanced = advanceArduino(instance.execution, event.elapsedMs, budget, host);
      inputs = host.currentInputs();
      firmware[id] = { ...instance, execution: advanced.execution };
      for (const output of advanced.gpio)
        events.push({
          atUs: (instance.startedAtUs ?? 0) + output.atMs * 1000,
          key: pinKey(id, output.pinId),
          state: output.state,
        });
      changed = true;
    } catch (error: unknown) {
      firmware[id] = { ...instance, serial: instance.execution.serial, execution: null, ...failure(error) };
      inputs = clearBoardInputs(inputs, project, id);
      changed = true;
    }
  }
  if (!changed) return previous;
  // A yielded board may lag another board. Keep future writes queued until all
  // active boards have reached the same electrical horizon.
  const horizons = Object.values(firmware).flatMap((instance) => instance.execution && !instance.error
    ? [(instance.startedAtUs ?? 0) + instance.execution.timeUs] : []);
  const timeUs = Math.max(previous.timeUs, horizons.length ? Math.min(...horizons) : previous.timeUs);
  const due = events.filter((output) => output.atUs <= timeUs);
  const timeline = !due.length && inputs === previous.inputs && !pwmPeriod(inputs)
    ? { inputs, snapshot: previous.snapshot }
    : evaluateCircuitTimeline(project, inputs, due, previous.timeUs, timeUs);
  return {
    ...previous,
    firmware,
    timeUs,
    pendingGpio: events.filter((output) => output.atUs > timeUs),
    inputs: timeline.inputs,
    snapshot: timeline.snapshot,
  };
}

/** Discrete virtual-time scheduling, with no high-frequency Redux dispatch. */
export function nextFirmwareDelay(state: SimulationState): number | null {
  if (state.status !== 'running') return null;
  const waits = Object.values(state.firmware).flatMap((instance) =>
    instance.execution && !instance.error
      ? [
          instance.execution.pendingUntilUs !== null
            ? 0
            : Math.max(
                0,
                ((instance.execution.wakeAtUs ?? instance.execution.timeUs) -
                  instance.execution.timeUs) /
                  1000,
              ),
        ]
      : [],
  );
  return waits.length ? Math.min(...waits) : null;
}

/** Browser frames may batch fast polling; VM event timestamps remain exact. */
export function nextFirmwareSlice(
  state: SimulationState,
): { waitMs: number; elapsedMs: number } | null {
  const delay = nextFirmwareDelay(state);
  if (delay === null) return null;
  if (delay === 0) return { waitMs: 1, elapsedMs: 0 };
  const deadlines = Object.values(state.firmware).flatMap((instance) => {
    const execution = instance.execution;
    return execution &&
      !instance.error &&
      execution.wakeReason === 'delay' &&
      execution.wakeAtUs !== null
      ? [Math.max(0, execution.wakeAtUs - execution.timeUs) / 1000]
      : [];
  });
  // Polling can be grouped into frames, but never across another board's
  // explicit delay deadline, including waits shorter than one frame.
  const elapsedMs = Math.min(Math.max(16, delay), ...deadlines);
  return { waitMs: Math.max(1, elapsedMs), elapsedMs };
}
