import type { CircuitProject, GpioState, VirtualHttpMethod, VirtualNetworkConfig } from '../model/types';
import { isVirtualHttpMethod, isVirtualHttpPath, MAX_VIRTUAL_BODY_LENGTH, MAX_VIRTUAL_PATH_LENGTH, normalizeVirtualNetworkConfig } from '../model/virtualNetwork';
import { ownInput } from './topology';

export const MAX_VIRTUAL_HISTORY = 50;
export const MAX_VIRTUAL_URL_LENGTH = 256;
export type VirtualNetworkError = 'invalid-request' | 'device-not-found' | 'not-running' | 'disconnected' |
  'target-mismatch' | 'route-not-found' | 'method-not-allowed' | 'unconfigured' | 'address-pool-exhausted';
export interface VirtualHttpRequest {
  componentId: string;
  method: VirtualHttpMethod;
  url: string;
  body?: string;
}
export interface VirtualHttpExchange {
  componentId: string;
  sequence: number;
  method: string;
  url: string;
  requestBody: string;
  status: number;
  responseBody: string;
  error?: VirtualNetworkError;
}
export interface VirtualDeviceState {
  connected: boolean;
  ssid: string | null;
  ip: string | null;
  history: readonly VirtualHttpExchange[];
  configuration: string;
  error?: VirtualNetworkError;
}
export interface VirtualNetworkState {
  devices: Readonly<Record<string, VirtualDeviceState>>;
  sequence: number;
  lastResponse: VirtualHttpExchange | null;
}
export interface GpioProposal {
  componentId: string;
  pinId: string;
  state: GpioState;
}
export interface VirtualHttpResult {
  virtualNetwork: VirtualNetworkState;
  response: VirtualHttpExchange;
  gpio?: GpioProposal;
}
export const initialVirtualNetwork = (): VirtualNetworkState => ({ devices: {}, sequence: 0, lastResponse: null });
const fingerprint = (config: VirtualNetworkConfig | undefined) => config === undefined ? '' : JSON.stringify(normalizeVirtualNetworkConfig(config));
const disconnected = (configuration: string, history: readonly VirtualHttpExchange[] = []): VirtualDeviceState => ({
  connected: false, ssid: null, ip: null, history, configuration,
});
/** Configuration is persistent truth; only the edited device loses its transient session. */
export function reconcileVirtualNetwork(previous: VirtualNetworkState, project: CircuitProject): VirtualNetworkState {
  const devices: [string, VirtualDeviceState][] = [];
  let changed = false;
  for (const component of project.components) {
    if (component.kind !== 'esp8266') continue;
    const old = ownInput(previous.devices, component.id);
    if (!old) continue;
    const configuration = fingerprint(component.properties.virtualNetwork);
    const next = configuration === old.configuration ? old : disconnected(configuration, old.history);
    changed ||= next !== old;
    devices.push([component.id, next]);
  }
  changed ||= devices.length !== Object.keys(previous.devices).length;
  return changed ? { ...previous, devices: Object.fromEntries(devices) } : previous;
}
export function connectVirtualDevice(previous: VirtualNetworkState, project: CircuitProject, componentId: string): VirtualNetworkState {
  const current = reconcileVirtualNetwork(previous, project);
  const component = project.components.find((item) => item.id === componentId && item.kind === 'esp8266');
  if (!component || component.kind !== 'esp8266') return current;
  const configuration = fingerprint(component.properties.virtualNetwork);
  const old = ownInput(current.devices, componentId) ?? disconnected(configuration);
  if (old.connected) return current;
  const config = component.properties.virtualNetwork;
  const occupied = new Set(Object.values(current.devices).filter((device) => device.connected).map((device) => device.ip));
  const free = Array.from({ length: 254 }, (_, index) => `192.0.2.${index + 1}`).find((ip) => !occupied.has(ip));
  const next: VirtualDeviceState = !config ? { ...old, error: 'unconfigured' }
    : free === undefined ? { ...old, error: 'address-pool-exhausted' }
      : { connected: true, ssid: config.ssid, ip: free, history: old.history, configuration };
  return { ...current, devices: { ...current.devices, [componentId]: next } };
}
export function disconnectVirtualDevice(previous: VirtualNetworkState, project: CircuitProject, componentId: string): VirtualNetworkState {
  const current = reconcileVirtualNetwork(previous, project);
  const component = project.components.find((item) => item.id === componentId && item.kind === 'esp8266');
  if (!component || component.kind !== 'esp8266') return current;
  const old = ownInput(current.devices, componentId);
  const next = disconnected(fingerprint(component.properties.virtualNetwork), old?.history);
  return { ...current, devices: { ...current.devices, [componentId]: next } };
}
const errorBody: Readonly<Record<VirtualNetworkError, string>> = {
  'invalid-request': 'Invalid virtual HTTP request', 'device-not-found': 'Virtual device not found',
  'not-running': 'Simulation must be running', disconnected: 'Virtual device is disconnected',
  'target-mismatch': 'Address does not match the expected device', 'route-not-found': 'Configured route not found',
  'method-not-allowed': 'Method not allowed for configured path', unconfigured: 'Virtual network is not configured',
  'address-pool-exhausted': 'Virtual address pool exhausted',
};
/** Strict virtual-only URL grammar. No fetch, URL/browser API, sockets, clocks, or firmware. */
export function requestVirtualHttp(previous: VirtualNetworkState, project: CircuitProject, request: unknown, running: boolean): VirtualHttpResult {
  const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
  const raw = record(request) ? request : {};
  const supplied = { componentId: ownInput(raw, 'componentId'), method: ownInput(raw, 'method'), url: ownInput(raw, 'url'), body: ownInput(raw, 'body') };
  const current = reconcileVirtualNetwork(previous, project);
  const componentId = typeof supplied.componentId === 'string' ? supplied.componentId : '';
  const method = typeof supplied.method === 'string' ? supplied.method.slice(0, 16) : '';
  const url = typeof supplied.url === 'string' ? supplied.url.slice(0, MAX_VIRTUAL_URL_LENGTH) : '';
  const body = typeof supplied.body === 'string' ? supplied.body.slice(0, MAX_VIRTUAL_BODY_LENGTH) : '';
  const component = project.components.find((item) => item.id === componentId && item.kind === 'esp8266');
  const sequence = current.sequence + 1;
  const finish = (status: number, responseBody: string, error?: VirtualNetworkError, gpio?: GpioProposal): VirtualHttpResult => {
    const response: VirtualHttpExchange = { componentId: componentId.slice(0, 200), sequence, method, url, requestBody: body, status, responseBody, ...(error ? { error } : {}) };
    let devices = current.devices;
    if (component?.kind === 'esp8266') {
      const old = ownInput(devices, componentId) ?? disconnected(fingerprint(component.properties.virtualNetwork));
      const next: VirtualDeviceState = { ...old, history: [...old.history, response].slice(-MAX_VIRTUAL_HISTORY), ...(error ? { error } : {}) };
      if (!error) delete next.error;
      devices = { ...devices, [componentId]: next };
    }
    const virtualNetwork: VirtualNetworkState = { devices, sequence, lastResponse: response };
    return { virtualNetwork, response, ...(gpio ? { gpio } : {}) };
  };
  const fail = (status: number, error: VirtualNetworkError) => finish(status, errorBody[error], error);
  if (typeof supplied.componentId !== 'string' || supplied.componentId.length === 0 || supplied.componentId.length > 200 ||
    !isVirtualHttpMethod(supplied.method) || typeof supplied.url !== 'string' || supplied.url.length > MAX_VIRTUAL_URL_LENGTH ||
    (supplied.body !== undefined && (typeof supplied.body !== 'string' || supplied.body.length > MAX_VIRTUAL_BODY_LENGTH))) return fail(400, 'invalid-request');
  const parsed = /^http:\/\/(192\.0\.2\.([1-9]\d{0,2}))(\/[^?#\s]*)$/.exec(supplied.url);
  const ip = parsed?.[1], host = parsed?.[2], path = parsed?.[3];
  if (!ip || !host || Number(host) > 254 || !isVirtualHttpPath(path) || path.length > MAX_VIRTUAL_PATH_LENGTH) return fail(400, 'invalid-request');
  if (!component || component.kind !== 'esp8266') return fail(404, 'device-not-found');
  if (!running) return fail(409, 'not-running');
  const device = ownInput(current.devices, componentId);
  if (!device?.connected) return fail(503, device?.error === 'address-pool-exhausted' ? 'address-pool-exhausted' : 'disconnected');
  if (device.ip !== ip) return fail(409, 'target-mismatch');
  const route = component.properties.virtualNetwork?.routes.find((item) => item.method === supplied.method && item.path === path);
  if (!route) return fail(component.properties.virtualNetwork?.routes.some((item) => item.path === path) ? 405 : 404,
    component.properties.virtualNetwork?.routes.some((item) => item.path === path) ? 'method-not-allowed' : 'route-not-found');
  const gpio: GpioProposal | undefined = route.gpio ? { componentId, pinId: route.gpio.pinId, state: { mode: 'output', level: route.gpio.level } } : undefined;
  return finish(route.status, route.responseBody, undefined, gpio);
}
