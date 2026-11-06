import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CircuitProject, GpioState } from '../../model/types';
import type { VirtualHttpRequest } from '../../sim/network';
import { nextFirmwareSlice } from './firmwareRuntime';
import {
  initialSimulation,
  reconcileSimulationProject,
  simulationProjectStamp,
  transitionSimulation,
} from './runtime';
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
  setDht11(componentId: string, temperature: number, humidity: number): void;
  connectDevice(componentId: string): void;
  disconnectDevice(componentId: string): void;
  requestHttp(request: VirtualHttpRequest): void;
}
/** Runtime lives outside Redux Persist; only discrete input changes evaluate the engine. */
export function useSimulation(
  project: CircuitProject,
  projectIdentity = project.id,
): SimulationController {
  const [state, setState] = useState(initialSimulation);
  const latest = useRef(state);
  const timer = useRef<number | null>(null);
  const arm = useRef<() => void>(() => undefined);
  const currentStamp = useMemo(
    () => simulationProjectStamp(project, projectIdentity),
    [project.components, project.wires, projectIdentity],
  );
  const stamp = useRef(currentStamp);
  const document = useRef(project);
  document.current = project;
  const send = useCallback((event: SimulationEvent) => {
    const previous = latest.current;
    const next = transitionSimulation(previous, event, document.current);
    latest.current = next;
    if (next !== previous) setState(next);
    if (
      event.type !== 'firmware-advance' &&
      (next.status !== previous.status || next.firmware !== previous.firmware)
    )
      arm.current();
  }, []);
  useEffect(() => {
    // The pump reads current transient state, rather than waiting for a React effect
    // after every tick. React batching or a delayed render cannot lose timer events.
    arm.current = () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
      const slice = nextFirmwareSlice(latest.current);
      if (!slice) return;
      timer.current = window.setTimeout(() => {
        timer.current = null;
        send({ type: 'firmware-advance', elapsedMs: slice.elapsedMs });
        arm.current();
      }, slice.waitMs);
    };
    arm.current();
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
      arm.current = () => undefined;
    };
  }, [send]);
  useEffect(() => {
    const before = stamp.current;
    const next = currentStamp;
    stamp.current = next;
    const reconciled = reconcileSimulationProject(
      latest.current,
      before,
      project,
      projectIdentity,
      next,
    );
    if (reconciled !== latest.current) {
      latest.current = reconciled;
      setState(reconciled);
      arm.current();
    }
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
    setDht11: (componentId, temperature, humidity) => send({ type: 'dht11', componentId, temperature, humidity }),
    connectDevice: (componentId) => send({ type: 'connect', componentId }),
    disconnectDevice: (componentId) => send({ type: 'disconnect', componentId }),
    requestHttp: (request) => send({ type: 'http', request }),
  };
}
