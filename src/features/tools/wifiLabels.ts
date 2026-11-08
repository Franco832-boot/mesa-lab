import type { WifiState } from '../../firmware/wifi';
import type { TranslationKey } from '../../locales/es/messages';
export const wifiLabels: Record<WifiState['status'], TranslationKey> = {
  0: 'espWifiConnecting', 3: 'espWifiConnected', 4: 'espWifiFailed', 6: 'espWifiDisconnected',
};
