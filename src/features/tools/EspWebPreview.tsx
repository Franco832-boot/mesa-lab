import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { HttpResponse } from '../../firmware/httpTypes';
import type { UnoExecution } from '../../firmware/machine';
import { WL_CONNECTED, WL_CONNECT_FAILED } from '../../firmware/wifi';
import type { FirmwareSession } from '../simulation/firmwareRuntime';
import { useLocale } from '../../locales/useLocale';
import { preparePreview, createPreviewShell } from './webPreviewDocument';
import type { PreviewPage } from './webPreviewDocument';
import { WEB_LIMITS, PreviewBudget, previewMessage, previewToken, virtualResourcePath } from './webPreviewProtocol';

export interface EspWebRuntime {
  running: boolean;
  execution: UnoExecution | null;
  session: FirmwareSession | undefined;
  request: (path: string) => HttpResponse;
}
interface OpenPage extends PreviewPage { token: string; shell: string; path: string; session: FirmwareSession | undefined }
export function EspWebPreview({ running, execution, session, request, visible, openedSessions, onAutoOpen, onClose }: EspWebRuntime & {
  visible: boolean;
  openedSessions: WeakSet<FirmwareSession>;
  onAutoOpen: () => void;
  onClose: () => void;
}) {
  const { t, locale } = useLocale();
  const available = running && execution?.wifi.status === WL_CONNECTED
    && Object.values(execution.http.servers).some((server) => server.began && server.polling);
  const frame = useRef<HTMLIFrameElement>(null);
  const requestRef = useRef(request), reveal = useRef(onAutoOpen);
  requestRef.current = request; reveal.current = onAutoOpen;
  const currentSession = useRef(session);
  currentSession.current = session;
  const active = useRef(available && visible);
  active.current = available && visible;
  useLayoutEffect(() => () => { active.current = false; }, []);
  const [page, setPage] = useState<OpenPage | null>(null);
  const [error, setError] = useState('');
  const [path, setPath] = useState('/');
  const load = (target = path) => {
    try {
      const nextPath = virtualResourcePath(target);
      setPage({ ...preparePreview(requestRef.current, nextPath), token: previewToken(), shell: createPreviewShell(previewToken()), path: nextPath, session: currentSession.current });
      setPath(nextPath); setError('');
    } catch (failure: unknown) { setPage(null); setError(failure instanceof Error ? failure.message : '500'); }
  };
  useEffect(() => {
    if (available && session && !openedSessions.has(session)) { openedSessions.add(session); reveal.current(); }
  }, [available, session, openedSessions]);
  useEffect(() => {
    if (available && visible) load('/');
    else { setPage(null); setError(''); }
  }, [available, visible, session, locale]);
  useEffect(() => {
    if (!page) return;
    const received = new Set<number>();
    const messages = new PreviewBudget(WEB_LIMITS.messagesPerSecond, WEB_LIMITS.messages);
    const requests = new PreviewBudget(WEB_LIMITS.requestsPerSecond, WEB_LIMITS.requests);
    const windowForPage = frame.current?.contentWindow;
    const receive = (event: MessageEvent<unknown>) => {
      if (!active.current || page.session !== currentSession.current || event.origin !== 'null' || event.source !== windowForPage) return;
      if (!messages.take(performance.now())) { setPage(null); setError('429'); return; }
      const message = previewMessage(event.data, page.token);
      if (!message) return;
      if (message.type === 'preview-error') { setError(message.text.replace(/^(?:Uncaught )?(?:[A-Za-z]*Error: )?/, '')); setPage(null); return; }
      if (received.has(message.id)) return;
      received.add(message.id);
      if (!requests.take(performance.now())) { setPage(null); setError('429'); return; }
      const result = requestRef.current(message.path);
      const response = result.body.length <= WEB_LIMITS.html ? result : { status: 413, contentType: 'text/plain', body: '413' };
      windowForPage?.postMessage({ type: 'result', token: page.token, id: message.id, response }, '*');
    };
    window.addEventListener('message', receive);
    return () => {
      window.removeEventListener('message', receive);
      windowForPage?.postMessage({ type: 'dispose', token: page.token }, '*');
    };
  }, [page]);
  const wifi = execution?.wifi;
  if (!visible) return null;
  const errorText = error === 'worker-timeout' ? t('espWebWorkerTimeout') : error === '413' ? t('espWebSizeLimit')
    : error === '408' ? t('espWebTimeout') : error === '415' ? t('espWebResourceType')
      : error.includes('unsupported-network') ? t('espWebNetworkBlocked') : error.includes('unsupported-') ? t('espWebUnsupportedApi')
        : error === 'element-missing' ? t('espWebElementMissing') : error === '429' ? t('espWebLimit') : error;
  return <section className="esp-web-preview" data-web-visible="true" aria-label={t('espWebView')}>
    <div className="esp-web-toolbar">
      <output data-testid="esp-web-address" aria-label={t('espWebAddress')}>{wifi?.ip ? `http://${wifi.ip}${page?.path ?? path}` : t('espWebUnavailable')}</output>
      <button type="button" className="text-button" data-testid="esp-preview-open" disabled={!available} onClick={() => load()}>{t('espWebRefresh')}</button>
      <button type="button" className="text-button" data-testid="esp-preview-close" onClick={onClose}>{t('espWebClose')}</button>
    </div>
    <form className="esp-web-path" onSubmit={(event) => { event.preventDefault(); load(); }}>
      <label>{t('espWebPath')}<input value={path} maxLength={WEB_LIMITS.path} onChange={(event) => setPath(event.target.value)} /></label>
      <button type="submit" className="text-button" disabled={!available}>{t('espWebGo')}</button>
    </form>
    <p role="status" data-testid="esp-wifi-status" data-state={wifi?.status ?? 6}>
      {t(wifi?.status === WL_CONNECTED ? 'espWifiConnected' : wifi?.status === WL_CONNECT_FAILED ? 'espWifiFailed' : 'espWifiDisconnected')}
      {wifi?.ip && <> · {wifi.ssid}</>}
    </p>
    {!available && <p>{t('espWebUnavailable')}</p>}
    {error && <p role="alert" data-testid="esp-web-error">{t('espWebError')} {errorText}</p>}
    {available && page?.session === session && page && <iframe key={page.token} ref={frame} title={t('espWebView')}
      data-testid="esp-web-frame" sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={page.shell}
      onLoad={() => frame.current?.contentWindow?.postMessage({ type: 'boot', token: page.token, html: page.html, scripts: page.scripts, lang: locale }, '*')} />}
  </section>;
}
