/** Code-driven educational adapter. No radio, credential service or network I/O. */
export const WL_CONNECTED = 3;
export const WL_CONNECT_FAILED = 4;
export const WL_DISCONNECTED = 6;
export const EMULATED_IP = '192.0.2.10';
export interface WifiState { status: 3 | 4 | 6; ssid: string | null; ip: string | null }
export const initialWifi = (): WifiState => ({ status: WL_DISCONNECTED, ssid: null, ip: null });
export function beginWifi(ssid: string, password: string): WifiState {
  return ssid.trim() && password.trim()
    ? { status: WL_CONNECTED, ssid, ip: EMULATED_IP }
    : { status: WL_CONNECT_FAILED, ssid: null, ip: null };
}
