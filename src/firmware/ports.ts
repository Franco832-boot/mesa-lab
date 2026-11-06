import type { DhtObservation } from '../model/dht11';
import type { UnoGpioEvent } from './machine';

/** Injected circuit port. The interpreter never accesses React, Redux or a global document. */
export interface FirmwareHost {
  observeDht(pinId: string, timeUs: number, pendingGpio: readonly UnoGpioEvent[]): DhtObservation | null;
}
