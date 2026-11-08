import type { VirtualWifiNetwork } from './wifi';
import type { DhtObservation } from '../model/dht11';
import type { UnoGpioEvent } from './machine';
import type { LcdBus, LcdOperation } from '../model/lcd';

/** Injected circuit port. The interpreter never accesses React, Redux or a global document. */
export interface FirmwareHost {
  wifiNetwork?: VirtualWifiNetwork;
  readDigital?(pinId: string, pendingGpio: readonly UnoGpioEvent[]): 0 | 1 | null;
  observeDht(pinId: string, timeUs: number, pendingGpio: readonly UnoGpioEvent[]): DhtObservation | null;
  writeLcd?(bus: LcdBus, operation: LcdOperation, pendingGpio: readonly UnoGpioEvent[]): void;
}
