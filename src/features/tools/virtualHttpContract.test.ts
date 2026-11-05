import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createProject } from '../../model/project';
import { createComponent } from '../../model/components';
import { connectVirtualDevice, initialVirtualNetwork, requestVirtualHttp } from '../../sim/network';

describe('local virtual HTTP example contract', () => {
  it('parses and describes opt-in routes that agree with the dispatcher', () => {
    const spec: unknown = JSON.parse(readFileSync(new URL('../../../docs/virtual-http.openapi.json', import.meta.url), 'utf8'));
    expect(spec).toMatchObject({ openapi: '3.0.3', 'x-mesa-virtual-only': true,
      paths: { '/led/on': { get: { responses: { '200': expect.any(Object), '409': expect.any(Object) } } },
        '/led/off': { get: { responses: { '200': expect.any(Object) } } } } });
    const board = createComponent('esp8266', { x: 0, y: 0 }, 'device');
    if (board.kind !== 'esp8266') throw new Error('fixture');
    board.properties.virtualNetwork = { ssid: 'Mesa Lab', routes: [
      { method: 'GET', path: '/led/on', status: 200, responseBody: 'on', gpio: { pinId: 'D1', level: 'HIGH' } },
      { method: 'GET', path: '/led/off', status: 200, responseBody: 'off', gpio: { pinId: 'D1', level: 'LOW' } },
    ] };
    const project = { ...createProject('contract'), components: [board], wires: [], programs: [] };
    const network = connectVirtualDevice(initialVirtualNetwork(), project, board.id);
    for (const [path, level] of [['/led/on', 'HIGH'], ['/led/off', 'LOW']]) {
      const result = requestVirtualHttp(network, project, { componentId: board.id, method: 'GET', url: `http://192.0.2.1${path}` }, true);
      expect(result.response.status).toBe(200);
      expect(result.gpio).toMatchObject({ componentId: board.id, pinId: 'D1', state: { mode: 'output', level } });
    }
    const request = { componentId: board.id, method: 'GET', url: 'http://192.0.2.1/led/on' };
    expect(requestVirtualHttp(network, project, request, false).response.status).toBe(409);
    expect(requestVirtualHttp(network, project, { ...request, url: 'http://192.0.2.2/led/on' }, true).response.status).toBe(409);
    expect(requestVirtualHttp(network, project, { ...request, url: 'https://192.0.2.1/led/on' }, true).response.status).toBe(400);
  });
});
