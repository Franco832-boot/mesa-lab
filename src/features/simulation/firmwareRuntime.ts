import type { CircuitProject } from '../../model/types';
import { componentDefinitions } from '../../model/components';
import { advanceArduino, createArduinoExecution, UnoExecutionError } from '../../firmware/uno';
import type { UnoExecution } from '../../firmware/uno';
import { evaluateCircuit } from '../../sim/engine';
import { ownInput, pinKey } from '../../sim/topology';
import type { SimulationInputs } from '../../sim/types';
import type { SimulationState } from './runtime';

export interface BoardExecution {
  source: string;
  execution: UnoExecution | null;
  error: string | null;
}
export type FirmwareState = Readonly<Record<string, BoardExecution>>;
export type FirmwareEvent =
  | { type: 'firmware-run'; componentId: string; source: string }
  | { type: 'firmware-stop'; componentId: string }
  | { type: 'firmware-advance'; elapsedMs: number };

function clearBoardInputs(inputs: SimulationInputs, project: CircuitProject, id: string): SimulationInputs {
  const component = project.components.find((item) => item.id === id);
  if (!component) return inputs;
  const keys = new Set(componentDefinitions[component.kind].pins.map((pin) => pinKey(id, pin.id)));
  return { ...inputs, gpio: Object.fromEntries(Object.entries(inputs.gpio ?? {}).filter(([key]) => !keys.has(key))) };
}
function failure(error: unknown): string {
  return error instanceof UnoExecutionError ? error.code : 'unsupported-syntax';
}
/** Runs actual parsed source; GPIO events enter the ordinary electrical inputs. */
export function transitionFirmware(previous: SimulationState, event: FirmwareEvent, project: CircuitProject): SimulationState {
  if (event.type === 'firmware-stop') {
    if (!ownInput(previous.firmware, event.componentId)) return previous;
    const firmware = Object.fromEntries(Object.entries(previous.firmware).filter(([id]) => id !== event.componentId));
    const inputs = clearBoardInputs(previous.inputs, project, event.componentId);
    return { ...previous, firmware, inputs,
      snapshot: previous.status === 'stopped' ? null : evaluateCircuit(project, inputs) };
  }
  if (event.type === 'firmware-run') {
    const board = project.components.find((item) => item.id === event.componentId);
    if (!board || (board.kind !== 'arduino-uno' && board.kind !== 'esp8266')) return previous;
    const inputs = clearBoardInputs(previous.inputs, project, board.id);
    try {
      const initial = advanceArduino(createArduinoExecution(event.source, board.kind), 0);
      const gpio = { ...inputs.gpio };
      for (const output of initial.gpio) gpio[pinKey(board.id, output.pinId)] = output.state;
      const nextInputs = { ...inputs, gpio };
      return { ...previous, status: 'running', inputs: nextInputs,
        firmware: { ...previous.firmware, [board.id]: { source: event.source, execution: initial.execution, error: null } },
        snapshot: evaluateCircuit(project, nextInputs) };
    } catch (error: unknown) {
      return { ...previous, inputs,
        firmware: { ...previous.firmware, [board.id]: { source: event.source, execution: null, error: failure(error) } },
        snapshot: previous.status === 'stopped' ? null : evaluateCircuit(project, inputs) };
    }
  }
  if (previous.status !== 'running' || !Number.isFinite(event.elapsedMs) || event.elapsedMs < 0) return previous;
  const firmware: Record<string, BoardExecution> = { ...previous.firmware };
  const gpio = { ...previous.inputs.gpio };
  const events: { offset: number; id: string; pinId: string; state: typeof gpio[string] }[] = [];
  let changed = false;
  for (const [id, instance] of Object.entries(previous.firmware)) {
    if (!instance.execution || instance.error) continue;
    try {
      const advanced = advanceArduino(instance.execution, event.elapsedMs);
      firmware[id] = { ...instance, execution: advanced.execution };
      for (const output of advanced.gpio) events.push({ offset: output.atMs - instance.execution.timeMs,
        id, pinId: output.pinId, state: output.state });
      changed = true;
    } catch (error: unknown) {
      firmware[id] = { ...instance, execution: null, error: failure(error) };
      changed = true;
    }
  }
  if (!changed) return previous;
  events.sort((a, b) => a.offset - b.offset);
  for (const output of events) gpio[pinKey(output.id, output.pinId)] = output.state;
  const inputs = events.length ? { ...previous.inputs, gpio } : previous.inputs;
  return { ...previous, firmware, inputs, snapshot: events.length ? evaluateCircuit(project, inputs) : previous.snapshot };
}

/** Discrete virtual-time scheduling, with no high-frequency Redux dispatch. */
export function nextFirmwareDelay(state: SimulationState): number | null {
  if (state.status !== 'running') return null;
  const waits = Object.values(state.firmware).flatMap((instance) => instance.execution && !instance.error
    ? [Math.max(0, (instance.execution.wakeAt ?? instance.execution.timeMs) - instance.execution.timeMs)] : []);
  return waits.length ? Math.min(...waits) : null;
}
