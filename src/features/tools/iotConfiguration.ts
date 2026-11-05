import type { VirtualNetworkConfig, VirtualRoute } from '../../model/types';
import { MAX_VIRTUAL_ROUTES } from '../../model/virtualNetwork';

/** Explicit example installation never replaces existing routes or a configured SSID. */
export function createLedHttpExample(existing?: VirtualNetworkConfig): VirtualNetworkConfig | null {
  const routes = existing?.routes ?? [];
  if (routes.length + 2 > MAX_VIRTUAL_ROUTES || routes.some((route) => route.method === 'GET' && ['/led/on', '/led/off'].includes(route.path)))
    return null;
  const examples: VirtualRoute[] = [
    { method: 'GET', path: '/led/on', status: 200, responseBody: 'D1=HIGH', gpio: { pinId: 'D1', level: 'HIGH' } },
    { method: 'GET', path: '/led/off', status: 200, responseBody: 'D1=LOW', gpio: { pinId: 'D1', level: 'LOW' } },
  ];
  return { ssid: existing?.ssid ?? 'Mesa Lab', routes: [...routes, ...examples] };
}
