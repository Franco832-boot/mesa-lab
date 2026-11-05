import { useState } from 'react';
import type { ElectronicComponent, VirtualNetworkConfig } from '../../model/types';
import type { ContextBoard } from './boardContext';
import type { SimulationController } from '../simulation/useSimulation';
import { useLocale } from '../../locales/useLocale';
import { gpioConfiguration, gpioPins } from '../../sim/gpio';
import { ownInput, pinKey } from '../../sim/topology';
import { logicMessages } from '../simulation/messages';
import { BoardHeader } from './BoardHeader';
import { VirtualDeviceStatus } from './VirtualDeviceStatus';
import { IotConfiguration } from './IotConfiguration';
import { IotHttpClient } from './IotHttpClient';
import { networkErrorMessages } from './virtualNetworkMessages';

function EspDeviceTools({ board, simulation, onConfig }: {
  board: Extract<ElectronicComponent, { kind: 'esp8266' }>;
  simulation: SimulationController;
  onConfig: (id: string, config: VirtualNetworkConfig) => boolean;
}) {
  const { t, locale } = useLocale();
  const device = ownInput(simulation.virtualNetwork.devices, board.id);
  const [monitorPinId, setMonitorPinId] = useState('D1');
  const pins = gpioPins('esp8266');
  const pin = pins.find((candidate) => candidate.id === monitorPinId);
  const configured = pin ? gpioConfiguration(board, pin, simulation.inputs) : undefined;
  const reading = pin ? simulation.snapshot?.pins[pinKey(board.id, pin.id)] : undefined;
  return (
    <>
      <section className="iot-section iot-session">
        <div className="iot-actions">
          <button className="secondary-button" data-testid="iot-connect" disabled={device?.connected ?? false}
            onClick={() => simulation.connectDevice(board.id)}>{t('iotConnect')}</button>
          <button className="secondary-button" data-testid="iot-disconnect" disabled={!device?.connected}
            onClick={() => simulation.disconnectDevice(board.id)}>{t('iotDisconnect')}</button>
        </div>
        <p>{t('iotSessionLifetime')}</p>
      </section>
      <IotConfiguration board={board} onConfig={onConfig} />
      <IotHttpClient board={board} device={device} simulation={simulation} />
      <section className="iot-section iot-gpio-reading" aria-label={t('iotGpioMonitor')}>
        <h3>{t('iotGpioMonitor')}</h3>
        <label className="iot-field"><span>{t('boardPin')}</span>
          <select data-testid="iot-monitor-pin" value={monitorPinId} onChange={(event) => setMonitorPinId(event.target.value)}>
            {pins.map((item) => <option key={item.id} value={item.id}>{item.id} · GPIO{item.gpio}</option>)}
          </select>
        </label>
        <p data-testid="iot-gpio-config">{configured?.mode === 'output' ? 'OUTPUT' : configured?.mode === 'input-pullup' ? 'INPUT_PULLUP' : 'INPUT'} · {configured?.level ?? 'FLOATING'}</p>
        <output data-testid="iot-gpio-reading">{t(logicMessages[reading?.logic ?? 'FLOATING'])} · {reading?.voltage === undefined ? t('unresolvedValue')
          : `${new Intl.NumberFormat(locale, { maximumSignificantDigits: 4 }).format(reading.voltage)} V`}</output>
        <p>{t('iotGpioNote')}</p>
      </section>
      <p className="iot-extension-note" data-testid="iot-preview-placeholder">{t('iotPreviewUnavailable')}</p>
    </>
  );
}

export function IotWorkspace({ boards, activeBoard, onSelectBoard, simulation, onConfig }: {
  boards: readonly ContextBoard[];
  activeBoard: ContextBoard | undefined;
  onSelectBoard: (id: string) => void;
  simulation: SimulationController;
  onConfig: (id: string, config: VirtualNetworkConfig) => boolean;
}) {
  const { t } = useLocale();
  const missingTarget = simulation.virtualNetwork.lastResponse?.error === 'device-not-found'
    ? simulation.virtualNetwork.lastResponse : null;
  return (
    <section className="iot-workspace" data-testid="iot-workspace" aria-label={t('iotTitle')}>
      <BoardHeader components={boards} activeBoardId={activeBoard?.id} onSelect={onSelectBoard}
        status={<VirtualDeviceStatus board={activeBoard} network={simulation.virtualNetwork} />} />
      <p className="iot-scope-note">{t('iotVirtualScope')}</p>
      {missingTarget && <p className="iot-error" data-testid="iot-missing-target-error">
        {t(networkErrorMessages['device-not-found'])} · {t('iotRequestTarget')}: <code>{missingTarget.componentId}</code>
      </p>}
      {activeBoard?.kind === 'esp8266' ? (
        <EspDeviceTools key={activeBoard.id} board={activeBoard} simulation={simulation} onConfig={onConfig} />
      ) : activeBoard?.kind === 'arduino-uno' ? <p className="tool-empty">{t('iotUnoNote')}</p> : <p className="tool-empty">{t('iotSelectBoard')}</p>}
    </section>
  );
}
