import { getPin } from './components';
import type { VirtualHttpMethod, VirtualNetworkConfig } from './types';

export const VIRTUAL_HTTP_METHODS: readonly VirtualHttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
export const MAX_VIRTUAL_ROUTES = 20;
export const MAX_VIRTUAL_BODY_LENGTH = 4096;
export const MAX_VIRTUAL_PATH_LENGTH = 200;
export const MAX_VIRTUAL_SSID_LENGTH = 32;
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
export const isVirtualHttpMethod = (value: unknown): value is VirtualHttpMethod =>
  typeof value === 'string' && VIRTUAL_HTTP_METHODS.some((method) => method === value);
/** Deliberately literal paths: no query, fragment, wildcard, template, or whitespace. */
export const isVirtualHttpPath = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= MAX_VIRTUAL_PATH_LENGTH && /^\/[A-Za-z0-9_./~-]*$/.test(value);
export function validateVirtualNetworkConfig(value: unknown): value is VirtualNetworkConfig {
  if (!record(value) || typeof value.ssid !== 'string' || value.ssid.length === 0 ||
    value.ssid.length > MAX_VIRTUAL_SSID_LENGTH || /[\u0000-\u001f\u007f]/.test(value.ssid) ||
    !Array.isArray(value.routes) || value.routes.length > MAX_VIRTUAL_ROUTES) return false;
  const seen = new Set<string>();
  for (const route of value.routes) {
    if (!record(route) || !isVirtualHttpMethod(route.method) || !isVirtualHttpPath(route.path) ||
      typeof route.status !== 'number' || !Number.isInteger(route.status) || route.status < 200 || route.status > 599 ||
      typeof route.responseBody !== 'string' || route.responseBody.length > MAX_VIRTUAL_BODY_LENGTH) return false;
    const key = JSON.stringify([route.method, route.path]);
    if (seen.has(key)) return false;
    seen.add(key);
    if (route.gpio !== undefined) {
      if (!record(route.gpio) || typeof route.gpio.pinId !== 'string' ||
        getPin('esp8266', route.gpio.pinId)?.gpio === undefined ||
        (route.gpio.level !== 'HIGH' && route.gpio.level !== 'LOW') || route.status >= 300) return false;
    }
  }
  return true;
}
/** Reconstruct known configuration fields; runtime/session data never enters the document. */
export function normalizeVirtualNetworkConfig(value: VirtualNetworkConfig): VirtualNetworkConfig {
  return { ssid: value.ssid, routes: value.routes.map((route) => ({
    method: route.method, path: route.path, status: route.status, responseBody: route.responseBody,
    ...(route.gpio ? { gpio: { pinId: route.gpio.pinId, level: route.gpio.level } } : {}),
  })) };
}
