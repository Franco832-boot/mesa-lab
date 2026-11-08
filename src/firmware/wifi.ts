/** In-memory fictional station environment. No radio, OS permissions or network I/O. */
export const WIFI_STA = 1;
export const WL_IDLE_STATUS = 0;
export const WL_CONNECTED = 3;
export const WL_CONNECT_FAILED = 4;
export const WL_DISCONNECTED = 6;
export const EMULATED_IP = '192.0.2.10';
export interface VirtualWifiNetwork {
  readonly ssid: string;
  readonly password: string;
  readonly connectDelayMs: number;
  readonly ip: string;
  readonly available: boolean;
}
export const DEFAULT_WIFI_NETWORK: VirtualWifiNetwork = Object.freeze({
  ssid: 'MiCasa', password: 'carlos', connectDelayMs: 300, ip: EMULATED_IP, available: true,
});
export function validWifiNetwork(network: VirtualWifiNetwork): boolean {
  const host = Number(network.ip.split('.').at(-1));
  return network.ssid.trim().length > 0 && network.ssid.length <= 80 && network.password.trim().length > 0 && network.password.length <= 128
    && Number.isSafeInteger(network.connectDelayMs) && network.connectDelayMs >= 1 && network.connectDelayMs <= 60000
    && /^192\.0\.2\.[0-9]{1,3}$/.test(network.ip) && host >= 1 && host <= 254;
}
export interface WifiState {
  status: 0 | 3 | 4 | 6;
  mode: 1;
  ssid: string | null;
  ip: string | null;
  /** The pending outcome never contains the submitted password. */
  attempt?: { dueUs: number; accepted: boolean; ssid: string; ip: string };
}
export const initialWifi = (): WifiState => ({ mode: WIFI_STA, status: WL_DISCONNECTED, ssid: null, ip: null });
export function beginWifi(ssid: string, password: string, timeUs = 0, network: VirtualWifiNetwork = DEFAULT_WIFI_NETWORK): WifiState {
  const accepted = validWifiNetwork(network) && network.available && !!ssid.trim() && !!password.trim()
    && ssid === network.ssid && password === network.password;
  return { mode: WIFI_STA, status: WL_IDLE_STATUS, ssid, ip: null,
    attempt: { dueUs: timeUs + network.connectDelayMs * 1000, accepted, ssid, ip: network.ip } };
}
export function advanceWifi(previous: WifiState, timeUs: number): WifiState {
  const attempt = previous.attempt;
  if (!attempt || timeUs < attempt.dueUs) return previous;
  return { mode: WIFI_STA, status: attempt.accepted ? WL_CONNECTED : WL_CONNECT_FAILED,
    ssid: attempt.accepted ? attempt.ssid : null, ip: attempt.accepted ? attempt.ip : null };
}
