import { useState } from 'react';
import type { ElectronicComponent, VirtualHttpMethod } from '../../model/types';
import { isVirtualHttpMethod, MAX_VIRTUAL_BODY_LENGTH, VIRTUAL_HTTP_METHODS } from '../../model/virtualNetwork';
import { MAX_VIRTUAL_HISTORY, MAX_VIRTUAL_URL_LENGTH } from '../../sim/network';
import type { VirtualDeviceState } from '../../sim/network';
import type { SimulationController } from '../simulation/useSimulation';
import { useLocale } from '../../locales/useLocale';
import { networkErrorMessages } from './virtualNetworkMessages';

export function IotHttpClient({ board, device, simulation }: {
  board: Extract<ElectronicComponent, { kind: 'esp8266' }>;
  device: VirtualDeviceState | undefined;
  simulation: SimulationController;
}) {
  const { t } = useLocale();
  const [method, setMethod] = useState<VirtualHttpMethod>('GET');
  const [url, setUrl] = useState('');
  const [body, setBody] = useState('');
  const [selectedSequence, setSelectedSequence] = useState<number | null>(null);
  const history = device?.history ?? [];
  const response = history.find((exchange) => exchange.sequence === selectedSequence) ?? history.at(-1);
  const routes = board.properties.virtualNetwork?.routes ?? [];
  return (
    <section className="iot-section" aria-label={t('iotHttpClient')}>
      <h3>{t('iotHttpClient')}</h3>
      <p>{t('iotVirtualRequestNote')}</p>
      <p className="iot-request-target">{t('iotRequestTarget')}: <code>{board.id}</code></p>
      <form className="iot-form" noValidate onSubmit={(event) => {
        event.preventDefault(); setSelectedSequence(null);
        simulation.requestHttp({ componentId: board.id, method, url, body });
      }}>
        {routes.length > 0 && (
          <label className="iot-field"><span>{t('iotUseConfiguredRoute')}</span>
            <select data-testid="iot-request-route" value="" disabled={!device?.connected} onChange={(event) => {
              const route = routes[Number(event.target.value)];
              if (route && device?.ip) { setMethod(route.method); setUrl(`http://${device.ip}${route.path}`); }
            }}>
              <option value="" disabled>{t('iotChooseRoute')}</option>
              {routes.map((route, index) => <option key={`${route.method}:${route.path}`} value={index}>{route.method} {route.path}</option>)}
            </select>
          </label>
        )}
        <label className="iot-field"><span>{t('iotMethod')}</span>
          <select data-testid="iot-request-method" value={method} onChange={(event) => {
            if (isVirtualHttpMethod(event.target.value)) setMethod(event.target.value);
          }}>{VIRTUAL_HTTP_METHODS.map((item) => <option key={item}>{item}</option>)}</select>
        </label>
        <label className="iot-field"><span>{t('iotRequestUrl')}</span>
          <input data-testid="iot-request-url" value={url} maxLength={MAX_VIRTUAL_URL_LENGTH} inputMode="url" autoComplete="off" spellCheck={false}
            onChange={(event) => setUrl(event.target.value)} placeholder={`http://${device?.ip ?? '192.0.2.x'}/path`} />
        </label>
        <label className="iot-field"><span>{t('iotRequestBody')}</span>
          <textarea data-testid="iot-request-body" value={body} maxLength={MAX_VIRTUAL_BODY_LENGTH}
            onChange={(event) => setBody(event.target.value)} />
        </label>
        <button className="secondary-button" data-testid="iot-send" type="submit">{t('iotSend')}</button>
      </form>
      {simulation.status !== 'running' && <p>{t('iotRequestNeedsRunning')}</p>}
      <section className="iot-response" aria-label={t('iotLastResponse')} aria-live="polite">
        <h4>{t('iotLastResponse')}</h4>
        {response ? (
          <>
            <p><output data-testid="iot-response-status">HTTP {response.status}</output> · {response.method} <code>{response.url}</code></p>
            <p>{t('iotRequestTarget')}: <code>{response.componentId}</code></p>
            {response.error && <p className="iot-error" data-testid="iot-response-error" data-error={response.error}>{t(networkErrorMessages[response.error])}</p>}
            <pre data-testid="iot-response-body">{response.responseBody}</pre>
            <details className="iot-request-details">
              <summary>{t('iotRecordedRequestBody')}</summary>
              <pre data-testid="iot-recorded-request-body">{response.requestBody || t('iotEmptyBody')}</pre>
            </details>
          </>
        ) : <p data-testid="iot-response-empty">{t('iotNoResponse')}</p>}
      </section>
      <details className="iot-history" data-testid="iot-history">
        <summary>{t('iotRequestHistory')} · {history.length} / {MAX_VIRTUAL_HISTORY}</summary>
        {history.length === 0 ? <p>{t('iotHistoryEmpty')}</p> : (
          <ol>
            {[...history].reverse().map((exchange) => (
              <li key={exchange.sequence}>
                <button type="button" className="text-button" onClick={() => setSelectedSequence(exchange.sequence)}>
                  #{exchange.sequence} · {exchange.method} {exchange.url} → {exchange.status}
                </button>
                {exchange.error && <p>{t(networkErrorMessages[exchange.error])}</p>}
              </li>
            ))}
          </ol>
        )}
      </details>
    </section>
  );
}
