import type { BoardKind } from '../model/types';
import { gpioPins } from '../sim/gpio';
import { DHT11_LIMITS } from '../model/dht11';
import type { DhtObservation } from '../model/dht11';
import { fail } from './errors';
import type { SourceSpan } from './errors';

export interface DhtObject {
  pinId: string;
  beganAtUs: number | null;
  attemptAtUs: number | null;
  sample: DhtObservation | null;
}
export interface HardwareSample { atUs: number; sample: DhtObservation }
export function constructDht(pin: number, type: number, board: BoardKind, at: SourceSpan): DhtObject {
  const contact = gpioPins(board).find((item) => item.gpio === pin);
  if (!contact || type !== 11) return fail('invalid-value', at);
  return { pinId: contact.id, beganAtUs: null, attemptAtUs: null, sample: null };
}
/** DHT.h-compatible two-second cache, with circuit validity checked on every call. */
export function readDht(object: DhtObject, observation: DhtObservation | null, nowUs: number, hardware: Map<string, HardwareSample>): DhtObject {
  if (object.beganAtUs === null) return { ...object, sample: null };
  const due = object.attemptAtUs === null || nowUs - object.attemptAtUs >= DHT11_LIMITS.apiCacheUs;
  if (!observation || nowUs - object.beganAtUs < DHT11_LIMITS.warmupUs) {
    return { ...object, sample: null, attemptAtUs: due ? nowUs : object.attemptAtUs };
  }
  if (!due) return object.sample?.sensorId === observation.sensorId ? object : { ...object, sample: null };
  const previous = hardware.get(observation.sensorId);
  const sample = previous && nowUs - previous.atUs < DHT11_LIMITS.sampleIntervalUs ? previous.sample : observation;
  if (sample === observation) hardware.set(observation.sensorId, { atUs: nowUs, sample });
  return { ...object, attemptAtUs: nowUs, sample };
}
