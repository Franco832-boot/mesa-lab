import type { TranslationKey } from '../../locales/es/messages';
import type { VirtualNetworkError } from '../../sim/network';

export const networkErrorMessages: Record<VirtualNetworkError, TranslationKey> = {
  'invalid-request': 'iotErrorInvalidRequest',
  'device-not-found': 'iotErrorDeviceNotFound',
  'not-running': 'iotErrorNotRunning',
  disconnected: 'iotErrorDisconnected',
  'target-mismatch': 'iotErrorTargetMismatch',
  'route-not-found': 'iotErrorRouteNotFound',
  'method-not-allowed': 'iotErrorMethodNotAllowed',
  unconfigured: 'iotErrorUnconfigured',
  'address-pool-exhausted': 'iotErrorAddressPool',
};
