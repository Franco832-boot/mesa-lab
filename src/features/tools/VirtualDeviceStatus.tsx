import { useLocale } from '../../locales/useLocale';
import type { VirtualNetworkState } from '../../sim/network';
import { ownInput } from '../../sim/topology';
import type { ContextBoard } from './boardContext';
import { networkErrorMessages } from './virtualNetworkMessages';

export function VirtualDeviceStatus({ board, network, testIdPrefix = 'iot' }: {
  board: ContextBoard | undefined;
  network: VirtualNetworkState;
  testIdPrefix?: string;
}) {
  const { t } = useLocale();
  const device = board ? ownInput(network.devices, board.id) : undefined;
  const status = !board ? 'no-board' : board.kind !== 'esp8266' ? 'unsupported'
    : device?.connected ? 'connected' : board.properties.virtualNetwork ? 'disconnected' : 'unconfigured';
  return (
    <div className="virtual-device-status" data-testid={`${testIdPrefix}-device-status`} data-status={status}>
      <span>{t(status === 'no-board' ? 'iotSelectBoard' : status === 'unsupported' ? 'iotUnsupportedBoard'
        : status === 'connected' ? 'iotConnected' : status === 'unconfigured' ? 'iotUnconfigured' : 'iotDisconnected')}</span>
      {board?.kind === 'esp8266' && device?.connected && (
        <span> · {device.ssid} · <output data-testid={`${testIdPrefix}-device-ip`}>{device.ip}</output></span>
      )}
      {device?.error && <p className="iot-error" data-testid={`${testIdPrefix}-device-error`}>{t(networkErrorMessages[device.error])}</p>}
    </div>
  );
}
