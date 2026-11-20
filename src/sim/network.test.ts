import { describe, expect, it } from 'vitest';
import { createComponent } from '../model/components';
import { createProject } from '../model/project';
import type { CircuitProject, ElectronicComponent, VirtualNetworkConfig } from '../model/types';
import { connectVirtualDevice, disconnectVirtualDevice, initialVirtualNetwork, reconcileVirtualNetwork, requestVirtualHttp } from './network';

const config = (): VirtualNetworkConfig => ({ ssid: 'Los Profes Para Vos', routes: [
  { method: 'GET', path: '/led/on', status: 200, responseBody: 'on', gpio: { pinId: 'D1', level: 'HIGH' } },
  { method: 'GET', path: '/led/off', status: 200, responseBody: 'off', gpio: { pinId: 'D1', level: 'LOW' } },
] });
const board = (id: string, network: VirtualNetworkConfig | undefined = config()): ElectronicComponent => ({
  ...createComponent('esp8266', { x: 0, y: 0 }, id), kind: 'esp8266', properties: { logicVoltage: 3.3, ...(network ? { virtualNetwork: network } : {}) },
});
const project = (...boards: ElectronicComponent[]): CircuitProject => ({ ...createProject('network'), components: boards, wires: [] });
const request = (componentId = 'a', url = 'http://192.0.2.1/led/on', method = 'GET') => ({ componentId, url, method });
describe('deterministic virtual WiFi and HTTP', () => {
  it('connects distinct devices with the lowest free virtual IP and retains SSID', () => {
    const doc = project(board('a'), board('b'));
    const initial = initialVirtualNetwork();
    const first = connectVirtualDevice(initial, doc, 'a');
    const second = connectVirtualDevice(first, doc, 'b');
    expect(first.devices.a?.ip).toBe('192.0.2.1');
    expect(second.devices.b?.ip).toBe('192.0.2.2');
    expect(second.devices.a?.ssid).toBe('Los Profes Para Vos');
    expect(initial.devices).toEqual({});
    expect(connectVirtualDevice(second, doc, 'a')).toBe(second);
  });
  it('disconnects only the target and deterministically reuses released addresses', () => {
    const doc = project(board('a'), board('b'));
    let state = connectVirtualDevice(connectVirtualDevice(initialVirtualNetwork(), doc, 'a'), doc, 'b');
    const b = state.devices.b;
    state = disconnectVirtualDevice(state, doc, 'a');
    expect(state.devices.a?.connected).toBe(false);
    expect(state.devices.a?.ip).toBeNull();
    expect(state.devices.b).toBe(b);
    expect(connectVirtualDevice(state, doc, 'a').devices.a?.ip).toBe('192.0.2.1');
  });
  it('requires explicit SSID configuration and never installs implicit routes', () => {
    const unconfigured: ElectronicComponent = { ...createComponent('esp8266', { x: 0, y: 0 }, 'a'), kind: 'esp8266', properties: { logicVoltage: 3.3 } };
    const doc = project(unconfigured);
    expect(connectVirtualDevice(initialVirtualNetwork(), doc, 'a').devices.a?.error).toBe('unconfigured');
    const empty = project(board('a', { ssid: 'explicit', routes: [] }));
    const connected = connectVirtualDevice(initialVirtualNetwork(), empty, 'a');
    expect(requestVirtualHttp(connected, empty, request(), true).response.status).toBe(404);
  });
  it('returns a typed GPIO proposal only for the explicitly configured route', () => {
    const doc = project(board('a'));
    const state = connectVirtualDevice(initialVirtualNetwork(), doc, 'a');
    const result = requestVirtualHttp(state, doc, request(), true);
    expect(result.response).toMatchObject({ componentId: 'a', status: 200, responseBody: 'on', sequence: 1 });
    expect(result.gpio).toEqual({ componentId: 'a', pinId: 'D1', state: { mode: 'output', level: 'HIGH' } });
    expect(state.devices.a?.history).toEqual([]);
  });
  it('resolves expected device and address together, never rerouting to another board', () => {
    const doc = project(board('a'), board('b'));
    const state = connectVirtualDevice(connectVirtualDevice(initialVirtualNetwork(), doc, 'a'), doc, 'b');
    const result = requestVirtualHttp(state, doc, request('b', 'http://192.0.2.1/led/on'), true);
    expect(result.response.status).toBe(409);
    expect(result.response.error).toBe('target-mismatch');
    expect(result.gpio).toBeUndefined();
    expect(result.virtualNetwork.devices.a).toBe(state.devices.a);
    expect(result.virtualNetwork.devices.b?.history).toHaveLength(1);
  });
  it('distinguishes missing route, wrong method, missing device and disconnected device', () => {
    const doc = project(board('a'));
    const state = connectVirtualDevice(initialVirtualNetwork(), doc, 'a');
    expect(requestVirtualHttp(state, doc, request('a', 'http://192.0.2.1/missing'), true).response.status).toBe(404);
    expect(requestVirtualHttp(state, doc, request('a', 'http://192.0.2.1/led/on', 'POST'), true).response.status).toBe(405);
    expect(requestVirtualHttp(state, doc, request('missing'), true).response.status).toBe(404);
    expect(requestVirtualHttp(initialVirtualNetwork(), doc, request(), true).response.status).toBe(503);
    expect(requestVirtualHttp(state, doc, request(), false).response.status).toBe(409);
  });
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'] as const)('supports configured %s and records bounded inert request text', (method) => {
    const doc = project(board('a', { ssid: 'manual', routes: [{ method, path: '/state', status: 202, responseBody: 'accepted', gpio: { pinId: 'D2', level: 'LOW' } }] }));
    const state = connectVirtualDevice(initialVirtualNetwork(), doc, 'a');
    const result = requestVirtualHttp(state, doc, { ...request('a', 'http://192.0.2.1/state', method), body: '{"pinId":"D8","execute":"anything"}' }, true);
    expect(result.response.status).toBe(202);
    expect(result.response.requestBody).toContain('D8');
    expect(result.gpio?.pinId).toBe('D2');
  });
  it.each([
    'https://192.0.2.1/led/on', 'http://example.com/led/on', 'http://192.0.2.1:80/led/on',
    'http://user@192.0.2.1/led/on', 'http://192.0.2.1/led/on?q=1', 'http://192.0.2.1/led/on#x',
    'http://192.0.2.0/led/on', 'http://192.0.2.255/led/on', 'http://192.0.2.01/led/on',
    'http://192.0.2.1/has space', '/led/on',
  ])('rejects unsupported URL %s without GPIO side effects', (url) => {
    const doc = project(board('a'));
    const state = connectVirtualDevice(initialVirtualNetwork(), doc, 'a');
    const result = requestVirtualHttp(state, doc, request('a', url), true);
    expect(result.response.status).toBe(400);
    expect(result.gpio).toBeUndefined();
  });
  it('rejects malformed external request values and truncates invalid log fields', () => {
    const doc = project(board('a'));
    const state = connectVirtualDevice(initialVirtualNetwork(), doc, 'a');
    for (const value of [null, 1, [], {}, { ...request(), method: 'get' }, { ...request(), body: 123 }, { ...request(), body: 'x'.repeat(4097) }])
      expect(requestVirtualHttp(state, doc, value, true).response.status).toBe(400);
    const result = requestVirtualHttp(state, doc, { ...request(), body: 'x'.repeat(6000) }, true);
    expect(result.response.requestBody).toHaveLength(4096);
  });
  it('uses literal paths and configured error statuses without implicit GPIO actions', () => {
    const doc = project(board('a', { ssid: 'manual', routes: [{ method: 'GET', path: '/State', status: 418, responseBody: 'configured failure' }] }));
    const state = connectVirtualDevice(initialVirtualNetwork(), doc, 'a');
    expect(requestVirtualHttp(state, doc, request('a', 'http://192.0.2.1/state'), true).response.status).toBe(404);
    const result = requestVirtualHttp(state, doc, request('a', 'http://192.0.2.1/State'), true);
    expect(result.response).toMatchObject({ status: 418, responseBody: 'configured failure' });
    expect(result.gpio).toBeUndefined();
  });
  it('bounds each device history to50 and uses deterministic monotonic sequence numbers', () => {
    const doc = project(board('a'), board('b'));
    let state = connectVirtualDevice(connectVirtualDevice(initialVirtualNetwork(), doc, 'a'), doc, 'b');
    for (let index = 0; index < 60; index++) state = requestVirtualHttp(state, doc, request(), true).virtualNetwork;
    expect(state.devices.a?.history).toHaveLength(50);
    expect(state.devices.a?.history[0]?.sequence).toBe(11);
    expect(state.sequence).toBe(60);
    expect(state.devices.b?.history).toEqual([]);
    expect(state.lastResponse?.sequence).toBe(60);
  });
  it('disconnects only edited configuration, retaining its history and other device identity', () => {
    const doc = project(board('a'), board('b'));
    let state = connectVirtualDevice(connectVirtualDevice(initialVirtualNetwork(), doc, 'a'), doc, 'b');
    state = requestVirtualHttp(state, doc, request(), true).virtualNetwork;
    const changed = project(board('a', { ...config(), ssid: 'changed' }), board('b'));
    const next = reconcileVirtualNetwork(state, changed);
    expect(next.devices.a?.connected).toBe(false);
    expect(next.devices.a?.history).toBe(state.devices.a?.history);
    expect(next.devices.b).toBe(state.devices.b);
    expect(reconcileVirtualNetwork(state, { ...doc, programs: [{ componentId: 'a', language: 'arduino-cpp', source: 'new code', execution: 'unavailable' }] })).toBe(state);
  });
  it('keeps prototype-like imported component IDs safe and does not allocate phantom records', () => {
    const doc = project(board('__proto__'));
    const state = connectVirtualDevice(initialVirtualNetwork(), doc, '__proto__');
    expect(Object.hasOwn(state.devices, '__proto__')).toBe(true);
    expect(requestVirtualHttp(state, doc, request('__proto__'), true).response.status).toBe(200);
    const bad = requestVirtualHttp(state, doc, request('constructor'), true);
    expect(Object.keys(bad.virtualNetwork.devices)).toEqual(['__proto__']);
    expect(bad.virtualNetwork.lastResponse?.componentId).toBe('constructor');
  });
  it('reports virtual pool exhaustion without duplicate addresses', () => {
    const doc = project(...Array.from({ length: 255 }, (_, index) => board(`b${index}`)));
    let state = initialVirtualNetwork();
    for (const component of doc.components) state = connectVirtualDevice(state, doc, component.id);
    expect(state.devices.b254?.error).toBe('address-pool-exhausted');
    expect(state.devices.b254?.connected).toBe(false);
    expect(new Set(Object.values(state.devices).filter((device) => device.connected).map((device) => device.ip)).size).toBe(254);
  });
});
