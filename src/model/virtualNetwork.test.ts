import { describe, expect, it } from 'vitest';
import { createComponent } from './components';
import { applyEditorCommand } from './editor';
import { createProject, parseProject, serializeProject } from './project';
import { normalizeVirtualNetworkConfig, validateVirtualNetworkConfig } from './virtualNetwork';
import type { CircuitProject, VirtualNetworkConfig } from './types';
import { migratePersistedProject } from '../app/persistence';

const config = (): VirtualNetworkConfig => ({ ssid: 'Los Profes Para Vos', routes: [{ method: 'GET', path: '/led/on', status: 200, responseBody: 'on', gpio: { pinId: 'D1', level: 'HIGH' } }] });
const project = (): CircuitProject => ({ ...createProject('network-config'), components: [createComponent('esp8266', { x: 10, y: 20 }, 'esp')], wires: [] });
describe('persisted virtual network configuration', () => {
  it('adds optional network config without changing v1 or old-document normalization', () => {
    const old = project();
    expect(parseProject(serializeProject(old))).toEqual(old);
    const next = applyEditorCommand(old, { type: 'network', id: 'esp', config: config() });
    expect(parseProject(serializeProject(next))).toEqual(next);
    expect(migratePersistedProject({ document: old, _persist: { version: 1 } }).document).toEqual(old);
    expect(migratePersistedProject({ document: next, _persist: { version: 1 } }).document).toEqual(next);
    expect(serializeProject(next)).not.toContain('connected');
    expect(serializeProject(next)).not.toContain('history');
    expect(next.version).toBe(1);
  });
  it('clears explicit config and rejects network configuration on non-ESP boards', () => {
    const next = applyEditorCommand(project(), { type: 'network', id: 'esp', config: config() });
    expect(applyEditorCommand(next, { type: 'network', id: 'esp', config: null })).toEqual(project());
    const uno = { ...project(), components: [createComponent('arduino-uno', { x: 0, y: 0 }, 'uno')] };
    expect(() => applyEditorCommand(uno, { type: 'network', id: 'uno', config: config() })).toThrow('invalid-network-component');
  });
  it('validates unique exact routes, statuses, pin capabilities and bounded payloads', () => {
    const route = config().routes[0];
    if (!route) throw new Error('fixture');
    for (const invalid of [
      { ...config(), ssid: '' }, { ...config(), ssid: 'x'.repeat(33) }, { ...config(), ssid: 'x\ny' },
      { ...config(), routes: [route, route] }, { ...config(), routes: Array(21).fill(route) },
      { ...config(), routes: [{ ...route, path: '/x?query' }] }, { ...config(), routes: [{ ...route, path: '/x#fragment' }] },
      { ...config(), routes: [{ ...route, path: '/:dynamic' }] }, { ...config(), routes: [{ ...route, path: 'no-leading-slash' }] },
      { ...config(), routes: [{ ...route, status: 199 }] }, { ...config(), routes: [{ ...route, status: 600 }] },
      { ...config(), routes: [{ ...route, status: 200.5 }] }, { ...config(), routes: [{ ...route, status: 500 }] },
      { ...config(), routes: [{ ...route, gpio: { pinId: 'A0', level: 'HIGH' } }] },
      { ...config(), routes: [{ ...route, gpio: { pinId: 'D1', level: 'FLOATING' } }] },
      { ...config(), routes: [{ ...route, responseBody: 'x'.repeat(4097) }] },
    ]) expect(validateVirtualNetworkConfig(invalid)).toBe(false);
    expect(validateVirtualNetworkConfig(config())).toBe(true);
    expect(validateVirtualNetworkConfig({ ssid: 'manual', routes: [] })).toBe(true);
  });
  it('normalizes only persisted configuration fields and preserves different methods at one path', () => {
    const base = config();
    const route = base.routes[0]; if (!route) throw new Error('fixture');
    const extra = { ...base, connected: true, ip: '192.0.2.1', history: [], routes: [{ ...route, arbitraryScript: 'never' }, { ...route, method: 'POST' as const }] };
    expect(validateVirtualNetworkConfig(extra)).toBe(true);
    expect(normalizeVirtualNetworkConfig(extra)).toEqual({ ssid: base.ssid, routes: [route, { ...route, method: 'POST' }] });
  });
  it('duplicates network config without sharing runtime identity and deletes it with its board', () => {
    const configured = applyEditorCommand(project(), { type: 'network', id: 'esp', config: config() });
    const copied = applyEditorCommand(configured, { type: 'duplicate', components: [{ originalId: 'esp', newId: 'copy' }], wires: [] });
    const component = copied.components.find((item) => item.id === 'copy');
    expect(component?.kind === 'esp8266' && component.properties.virtualNetwork).toEqual(config());
    expect(applyEditorCommand(copied, { type: 'delete', componentIds: ['copy'], wireIds: [] }).components).toHaveLength(1);
  });
});
