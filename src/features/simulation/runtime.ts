import type { CircuitProject, GpioState } from '../../model/types';
import { connectVirtualDevice, disconnectVirtualDevice, initialVirtualNetwork, reconcileVirtualNetwork, requestVirtualHttp } from '../../sim/network';
import type { VirtualHttpRequest, VirtualNetworkState } from '../../sim/network';
import { transitionFirmware } from './firmwareRuntime';
import type { FirmwareEvent, FirmwareState } from './firmwareRuntime';
import { evaluateCircuit } from '../../sim/engine';
import { ownInput, pinKey } from '../../sim/topology';
import type { ElectricalSnapshot, SimulationInputs } from '../../sim/types';

export type SimulationStatus = 'stopped' | 'running' | 'paused';
export interface SimulationState {
  firmware: FirmwareState;
  status: SimulationStatus;
  inputs: SimulationInputs;
  snapshot: ElectricalSnapshot | null;
  virtualNetwork: VirtualNetworkState;
}
export type SimulationEvent = FirmwareEvent
  | { type: 'dht11'; componentId: string; temperature: number; humidity: number }
  | { type: 'start' | 'pause' | 'stop' | 'reset' }
  | { type: 'gpio'; componentId: string; pinId: string; state: GpioState }
  | { type: 'button'; componentId: string; pressed: boolean }
  | { type: 'potentiometer'; componentId: string; ratio: number }
  | { type: 'connect' | 'disconnect'; componentId: string }
  | { type: 'http'; request: VirtualHttpRequest };

export const initialSimulation = (): SimulationState => ({
  status: 'stopped', inputs: {}, snapshot: null, firmware: {}, virtualNetwork: initialVirtualNetwork(),
});
/** Discrete, deterministic lifecycle. No timers or document mutations. */
export function transitionSimulation(
  previous: SimulationState,
  event: SimulationEvent,
  project: CircuitProject,
): SimulationState {
  if (event.type === 'stop' || event.type === 'reset') return initialSimulation();
  if (event.type === 'firmware-clear-serial' || event.type === 'firmware-http' || event.type === 'firmware-run' || event.type === 'firmware-stop' || event.type === 'firmware-advance')
    return transitionFirmware(previous, event, project);
  if (event.type === 'connect' || event.type === 'disconnect') {
    return { ...previous, virtualNetwork: event.type === 'connect'
      ? connectVirtualDevice(previous.virtualNetwork, project, event.componentId)
      : disconnectVirtualDevice(previous.virtualNetwork, project, event.componentId) };
  }
  if (event.type === 'http') {
    const result = requestVirtualHttp(previous.virtualNetwork, project, event.request, previous.status === 'running');
    if (!result.gpio) return { ...previous, virtualNetwork: result.virtualNetwork };
    // A validated proposal enters the same GPIO/electrical transition as manual controls.
    const applied = transitionSimulation(previous, { type: 'gpio', componentId: result.gpio.componentId,
      pinId: result.gpio.pinId, state: result.gpio.state }, project);
    return { ...applied, virtualNetwork: result.virtualNetwork };
  }
  if (event.type === 'pause') {
    // A momentary contact cannot remain stuck when released during a pause.
    return previous.status === 'running'
      ? { ...previous, status: 'paused', inputs: { ...previous.inputs, buttons: {} } }
      : previous;
  }
  if (event.type === 'start') {
    return previous.status === 'running' ? previous : {
      ...previous, status: 'running', snapshot: evaluateCircuit(project, previous.inputs),
    };
  }
  if (previous.status !== 'running') return previous;
  let inputs: SimulationInputs;
  switch (event.type) {
    case 'dht11':
      inputs = { ...previous.inputs, dht11: { ...previous.inputs.dht11, [event.componentId]: { temperature: event.temperature, humidity: event.humidity } } };
      break;
    case 'gpio': {
      const key = pinKey(event.componentId, event.pinId);
      const old = ownInput(previous.inputs.gpio, key);
      if (old?.mode === event.state.mode && old.level === event.state.level) return previous;
      inputs = { ...previous.inputs, gpio: { ...previous.inputs.gpio, [key]: event.state } };
      break;
    }
    case 'button':
      if ((ownInput(previous.inputs.buttons, event.componentId) ?? false) === event.pressed) return previous;
      inputs = { ...previous.inputs, buttons: { ...previous.inputs.buttons, [event.componentId]: event.pressed } };
      break;
    case 'potentiometer':
      if (ownInput(previous.inputs.potentiometers, event.componentId) === event.ratio) return previous;
      inputs = { ...previous.inputs, potentiometers: { ...previous.inputs.potentiometers, [event.componentId]: event.ratio } };
      break;
  }
  return { ...previous, status: 'running', inputs, snapshot: evaluateCircuit(project, inputs) };
}

/** Only electrical model data participates; code, network settings and visuals do not. */
export function electricalProjectFingerprint(project: CircuitProject): string {
  const components = project.components.map((component) => ({
    id: component.id, kind: component.kind,
    properties: component.kind === 'esp8266' ? { logicVoltage: component.properties.logicVoltage } : component.properties,
    ...(component.attachments?.length ? { attachments: [...component.attachments].sort((a, b) => a.pinId < b.pinId ? -1 : a.pinId > b.pinId ? 1 : 0) } : {}),
  })).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const wires = project.wires.map((wire) => ({ id: wire.id, from: wire.from, to: wire.to }))
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return JSON.stringify({ components, wires });
}
export interface SimulationProjectStamp {
  identity: string;
  electrical: string;
}
export function simulationProjectStamp(project: CircuitProject, identity = project.id): SimulationProjectStamp {
  return { identity, electrical: electricalProjectFingerprint(project) };
}
/** Metadata edits preserve the exact snapshot; electrical edits/import epochs reset runtime. */
export function reconcileSimulationProject(previous: SimulationState, before: SimulationProjectStamp, project: CircuitProject, identity = project.id, next = simulationProjectStamp(project, identity)): SimulationState {
  if (before.identity !== next.identity || before.electrical !== next.electrical) return initialSimulation();
  const virtualNetwork = reconcileVirtualNetwork(previous.virtualNetwork, project);
  return virtualNetwork === previous.virtualNetwork ? previous : { ...previous, virtualNetwork };
}
