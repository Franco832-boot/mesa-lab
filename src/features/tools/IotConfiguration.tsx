import { useEffect, useState } from 'react';
import type { ElectronicComponent, VirtualHttpMethod, VirtualNetworkConfig, VirtualRoute } from '../../model/types';
import {
  isVirtualHttpMethod, isVirtualHttpPath, MAX_VIRTUAL_BODY_LENGTH, MAX_VIRTUAL_PATH_LENGTH,
  MAX_VIRTUAL_ROUTES, MAX_VIRTUAL_SSID_LENGTH, validateVirtualNetworkConfig, VIRTUAL_HTTP_METHODS,
} from '../../model/virtualNetwork';
import { gpioPins } from '../../sim/gpio';
import { useLocale } from '../../locales/useLocale';
import type { TranslationKey } from '../../locales/es/messages';
import { createLedHttpExample } from './iotConfiguration';

interface RouteDraft {
  index: number | null;
  method: VirtualHttpMethod;
  path: string;
  status: string;
  responseBody: string;
  pinId: string;
  level: 'HIGH' | 'LOW';
}
export function IotConfiguration({ board, onConfig }: {
  board: Extract<ElectronicComponent, { kind: 'esp8266' }>;
  onConfig: (id: string, config: VirtualNetworkConfig) => boolean;
}) {
  const { t } = useLocale();
  const config = board.properties.virtualNetwork;
  const routes = config?.routes ?? [];
  const [ssid, setSsid] = useState(config?.ssid ?? '');
  const [draft, setDraft] = useState<RouteDraft | null>(null);
  const [notice, setNotice] = useState<TranslationKey | null>(null);
  useEffect(() => setSsid(config?.ssid ?? ''), [config?.ssid]);
  useEffect(() => setDraft(null), [config]);
  const save = (next: VirtualNetworkConfig) => {
    const success = validateVirtualNetworkConfig(next) && onConfig(board.id, next);
    setNotice(success ? 'iotConfigSaved' : 'iotConfigError');
    return success;
  };
  const exampleAvailable = createLedHttpExample(config) !== null;
  return (
    <section className="iot-section iot-configuration" aria-label={t('iotConfiguration')}>
      <h3>{t('iotConfiguration')}</h3>
      <form className="iot-form" noValidate onSubmit={(event) => { event.preventDefault(); save({ ssid, routes: [...routes] }); }}>
        <label className="iot-field"><span>{t('iotSsid')}</span>
          <input data-testid="iot-ssid" value={ssid} maxLength={MAX_VIRTUAL_SSID_LENGTH} autoComplete="off"
            onChange={(event) => setSsid(event.target.value)} />
        </label>
        <button className="secondary-button" data-testid="iot-save-ssid" type="submit">{t('iotSaveSsid')}</button>
      </form>
      <p>{t('iotConfigLifetime')}</p>
      <div className="iot-actions">
        <button className="secondary-button" data-testid="iot-install-example" disabled={!exampleAvailable} onClick={() => {
          const example = createLedHttpExample(config);
          if (example) save(example);
        }}>{t('iotInstallExample')}</button>
        <button className="secondary-button" data-testid="iot-add-route" disabled={!config || routes.length >= MAX_VIRTUAL_ROUTES}
          onClick={() => setDraft({ index: null, method: 'GET', path: '', status: '200', responseBody: '', pinId: '', level: 'HIGH' })}>{t('iotAddRoute')}</button>
      </div>
      <p>{t('iotExampleNote')}</p>
      {!exampleAvailable && <p>{t('iotExampleUnavailable')}</p>}
      <p>{routes.length} / {MAX_VIRTUAL_ROUTES} {t('iotConfiguredRoutes')}</p>
      {routes.length === 0 ? <p data-testid="iot-routes-empty">{t('iotNoRoutes')}</p> : (
        <ul className="iot-route-list" data-testid="iot-route-list">
          {routes.map((route, index) => (
            <li className="iot-route-item" key={`${route.method}:${route.path}`}>
              <strong>{route.method} {route.path}</strong><span> · HTTP {route.status}</span>
              {route.gpio && <p>{route.gpio.pinId} → OUTPUT {route.gpio.level}</p>}
              <pre>{route.responseBody}</pre>
              <div className="iot-actions">
                <button className="text-button" data-testid={`iot-route-edit-${index}`} onClick={() => setDraft({ index,
                  method: route.method, path: route.path, status: String(route.status), responseBody: route.responseBody,
                  pinId: route.gpio?.pinId ?? '', level: route.gpio?.level ?? 'HIGH' })}>{t('iotEditRoute')}</button>
                <button className="text-button" data-testid={`iot-route-remove-${index}`} onClick={() => {
                  if (save({ ssid: config?.ssid ?? '', routes: routes.filter((_, item) => item !== index) })) setDraft(null);
                }}>{t('iotRemoveRoute')}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {draft && (
        <form className="iot-form iot-route-form" noValidate onSubmit={(event) => {
          event.preventDefault();
          const route: VirtualRoute = { method: draft.method, path: draft.path, status: Number(draft.status), responseBody: draft.responseBody,
            ...(draft.pinId ? { gpio: { pinId: draft.pinId, level: draft.level } } : {}) };
          const next = draft.index === null ? [...routes, route] : routes.map((item, index) => index === draft.index ? route : item);
          if (save({ ssid: config?.ssid ?? '', routes: next })) setDraft(null);
        }}>
          <h4>{t(draft.index === null ? 'iotAddRoute' : 'iotEditRoute')}</h4>
          <label className="iot-field"><span>{t('iotMethod')}</span>
            <select data-testid="iot-route-method" value={draft.method} onChange={(event) => {
              if (isVirtualHttpMethod(event.target.value)) setDraft({ ...draft, method: event.target.value });
            }}>{VIRTUAL_HTTP_METHODS.map((method) => <option key={method}>{method}</option>)}</select>
          </label>
          <label className="iot-field"><span>{t('iotRoutePath')}</span>
            <input data-testid="iot-route-path" value={draft.path} maxLength={MAX_VIRTUAL_PATH_LENGTH} aria-invalid={!isVirtualHttpPath(draft.path)}
              onChange={(event) => setDraft({ ...draft, path: event.target.value })} placeholder="/status" />
          </label>
          <label className="iot-field"><span>{t('iotRouteStatus')}</span>
            <input type="number" data-testid="iot-route-status" min={200} max={599} step={1} value={draft.status}
              onChange={(event) => setDraft({ ...draft, status: event.target.value })} />
          </label>
          <label className="iot-field"><span>{t('iotResponseBody')}</span>
            <textarea data-testid="iot-route-response-body" value={draft.responseBody} maxLength={MAX_VIRTUAL_BODY_LENGTH}
              onChange={(event) => setDraft({ ...draft, responseBody: event.target.value })} />
          </label>
          <label className="iot-field"><span>{t('iotRouteGpio')}</span>
            <select data-testid="iot-route-gpio-pin" value={draft.pinId} onChange={(event) => setDraft({ ...draft, pinId: event.target.value })}>
              <option value="">{t('iotNoGpioAction')}</option>
              {gpioPins('esp8266').map((pin) => <option key={pin.id} value={pin.id}>{pin.id} · GPIO{pin.gpio}</option>)}
            </select>
          </label>
          <label className="iot-field"><span>{t('iotRouteLevel')}</span>
            <select data-testid="iot-route-gpio-level" value={draft.level} disabled={!draft.pinId} onChange={(event) => {
              const level = event.target.value;
              if (level === 'HIGH' || level === 'LOW') setDraft({ ...draft, level });
            }}><option>HIGH</option><option>LOW</option></select>
          </label>
          <p>{t('iotGpioActionNote')}</p>
          <div className="iot-actions">
            <button className="secondary-button" data-testid="iot-route-save" type="submit">{t('iotSaveRoute')}</button>
            <button className="text-button" data-testid="iot-route-cancel" type="button" onClick={() => setDraft(null)}>{t('cancel')}</button>
          </div>
        </form>
      )}
      {notice && <p role="status" data-testid="iot-config-notice" className={notice === 'iotConfigError' ? 'iot-error' : ''}>{t(notice)}</p>}
    </section>
  );
}
