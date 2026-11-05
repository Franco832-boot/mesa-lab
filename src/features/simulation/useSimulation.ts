import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CircuitProject, GpioState } from '../../model/types';
import type { VirtualHttpRequest } from '../../sim/network';
import { nextFirmwareDelay } from './firmwareRuntime';
import { initialSimulation, reconcileSimulationProject, simulationProjectStamp, transitionSimulation } from './runtime';
import type { SimulationEvent, SimulationState } from './runtime';

export interface SimulationController extends SimulationState {
  runFirmware(componentId: string, source: string): void;
  stopFirmware(componentId: string): void;
  start(): void;
  pause(): void;
  stop(): void;
  reset(): void;
  setGpio(componentId: string, pinId: string, state: GpioState): void;
  setButton(componentId: string, pressed: boolean): void;
  setPotentiometer(componentId: string, ratio: number): void;
  connectDevice(componentId: string): void;
  disconnectDevice(componentId: string): void;
  requestHttp(request: VirtualHttpRequest): void;
}
/** Runtime lives outside Redux Persist; only discrete input changes evaluate the engine. */
export function useSimulation(project: CircuitProject, projectIdentity = project.id): SimulationController {
  const [state, setState] = useState(initialSimulation);
  const currentStamp = useMemo(() => simulationProjectStamp(project, projectIdentity),
    [project.components, project.wires, projectIdentity]);
  const stamp = useRef(currentStamp);
  const document = useRef(project);
  document.current = project;
  const send = useCallback((event: SimulationEvent) => {
    setState((previous) => transitionSimulation(previous, event, document.current));
  }, []);
  const delay = nextFirmwareDelay(state);
  useEffect(() => {
    if (delay === null) return;
    const timer = window.setTimeout(() => send({ type: 'firmware-advance', elapsedMs: delay }), Math.max(1, delay));
    return () => window.clearTimeout(timer);
  }, [state.firmware, state.status, delay, send]);
  useEffect(() => {
    const before = stamp.current;
    const next = currentStamp;
    stamp.current = next;
    setState((previous) => reconcileSimulationProject(previous, before, project, projectIdentity, next));
  }, [currentStamp]);
  return {
    ...state,
    runFirmware: (componentId, source) => send({ type: 'firmware-run', componentId, source }),
    stopFirmware: (componentId) => send({ type: 'firmware-stop', componentId }),
    start: () => send({ type: 'start' }),
    pause: () => send({ type: 'pause' }),
    stop: () => send({ type: 'stop' }),
    reset: () => send({ type: 'reset' }),
    setGpio: (componentId, pinId, gpio) => send({ type: 'gpio', componentId, pinId, state: gpio }),
    setButton: (componentId, pressed) => send({ type: 'button', componentId, pressed }),
    setPotentiometer: (componentId, ratio) => send({ type: 'potentiometer', componentId, ratio }),
    connectDevice: (componentId) => send({ type: 'connect', componentId }),
    disconnectDevice: (componentId) => send({ type: 'disconnect', componentId }),
    requestHttp: (request) => send({ type: 'http', request }),
  };
}
