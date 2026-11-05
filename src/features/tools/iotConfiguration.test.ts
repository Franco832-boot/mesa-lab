import { describe, expect, it } from 'vitest';
import type { VirtualNetworkConfig } from '../../model/types';
import { MAX_VIRTUAL_ROUTES, validateVirtualNetworkConfig } from '../../model/virtualNetwork';
import { createLedHttpExample } from './iotConfiguration';

describe('explicit virtual LED route installation', () => {
  it('creates exactly two valid D1 routes and a default SSID only when requested', () => {
    const example = createLedHttpExample();
    expect(example).toEqual({ ssid: 'Mesa Lab', routes: [
      { method: 'GET', path: '/led/on', status: 200, responseBody: 'D1=HIGH', gpio: { pinId: 'D1', level: 'HIGH' } },
      { method: 'GET', path: '/led/off', status: 200, responseBody: 'D1=LOW', gpio: { pinId: 'D1', level: 'LOW' } },
    ] });
    expect(validateVirtualNetworkConfig(example)).toBe(true);
  });
  it('preserves configured SSID and existing routes without mutating project configuration', () => {
    const existing: VirtualNetworkConfig = { ssid: 'My device', routes: [{ method: 'POST', path: '/status', status: 201, responseBody: 'created' }] };
    const before = JSON.stringify(existing);
    const example = createLedHttpExample(existing);
    expect(example?.ssid).toBe('My device');
    expect(example?.routes[0]).toEqual(existing.routes[0]);
    expect(example?.routes).toHaveLength(3);
    expect(JSON.stringify(existing)).toBe(before);
  });
  it('does not overwrite a conflicting user route', () => {
    const existing: VirtualNetworkConfig = { ssid: 'Custom', routes: [{ method: 'GET', path: '/led/on', status: 202, responseBody: 'custom' }] };
    expect(createLedHttpExample(existing)).toBeNull();
    expect(existing.routes[0]?.responseBody).toBe('custom');
  });
  it('respects the route limit and rejects duplicate example installation', () => {
    const existing: VirtualNetworkConfig = { ssid: 'Full', routes: Array.from({ length: MAX_VIRTUAL_ROUTES - 1 }, (_, index) => ({ method: 'GET', path: `/route${index}`, status: 200, responseBody: '' })) };
    expect(createLedHttpExample(existing)).toBeNull();
    const first = createLedHttpExample();
    if (!first) throw new Error('invalid example fixture');
    expect(createLedHttpExample(first)).toBeNull();
  });
  it('keeps an independently configured method on an example path', () => {
    const existing: VirtualNetworkConfig = { ssid: 'Custom', routes: [{ method: 'POST', path: '/led/on', status: 200, responseBody: 'posted' }] };
    const example = createLedHttpExample(existing);
    expect(example?.routes).toHaveLength(3);
    expect(validateVirtualNetworkConfig(example)).toBe(true);
  });
});
