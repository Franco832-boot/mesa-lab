/** Joy-IT KY-015 profile: grille/front view, header down, left to right S, +, −. */
export const DHT11_PULLUP_OHMS = 10_000;
export const DHT11_LIMITS = { temperatureMin: 0, temperatureMax: 50, humidityMin: 20, humidityMax: 90,
  supplyMin: 3, supplyMax: 5.5, warmupUs: 1_000_000, sampleIntervalUs: 2_000_000, apiCacheUs: 2_000_000 } as const;
export interface DhtEnvironment { temperature: number; humidity: number }
export interface DhtObservation extends DhtEnvironment { sensorId: string }
export function validDhtEnvironment(value: DhtEnvironment): boolean {
  return Number.isFinite(value.temperature) && value.temperature >= DHT11_LIMITS.temperatureMin && value.temperature <= DHT11_LIMITS.temperatureMax
    && Number.isFinite(value.humidity) && value.humidity >= DHT11_LIMITS.humidityMin && value.humidity <= DHT11_LIMITS.humidityMax;
}
