import { useLayoutEffect, useRef } from 'react';
import type { BoardExecution } from './firmwareRuntime';
import { firmwareErrorMessages } from './messages';
import { useLocale } from '../../locales/useLocale';

/** A view of the existing transient runtime; never creates or persists monitor data. */
export function BoardRuntimeMonitor({ componentId, instance, onClear }: {
  componentId: string;
  instance: BoardExecution | undefined;
  onClear?: (() => void) | undefined;
}) {
  const { t } = useLocale();
  const serial = instance?.execution?.serial ?? instance?.serial;
  const output = useRef<HTMLPreElement>(null);
  const following = useRef(true);
  useLayoutEffect(() => {
    if (following.current && output.current) output.current.scrollTop = output.current.scrollHeight;
  }, [serial?.output]);
  return <>
    {serial?.baudRate ? <section id={`serial-${encodeURIComponent(componentId)}`} tabIndex={-1} className="serial-monitor" aria-label={`${t('serialMonitor')} · ${componentId}`}>
      <h3>{t('serialMonitor')} · {componentId} · {serial.baudRate} baud</h3>
      <p>{t('serialVirtual')}</p>
      {onClear && <button type="button" className="text-button" data-testid="serial-clear" onClick={onClear}>{t('serialClear')}</button>}
      <pre ref={output} onScroll={() => { const node = output.current; if (node) following.current = node.scrollHeight - node.clientHeight - node.scrollTop < 24; }} data-testid="serial-output" data-component-id={componentId}
        role="log" aria-live="polite" aria-label={`${t('serialMonitor')} · ${componentId}`}>{serial.output}</pre>
      {serial.truncated && <p>{t('serialTruncated')}</p>}
    </section> : null}
    {instance?.error && <p role="alert" data-testid="firmware-error"
      data-component-id={componentId} data-code={instance.error}>
      <strong>{componentId} · {t('firmwareError')}</strong>: {t(firmwareErrorMessages[instance.error])}
      {instance.location?.file && <> · {instance.location.file}</>}
      {instance.location && <> · {t('firmwareLine')} {instance.location.line}, {t('firmwareColumn')} {instance.location.column}</>}
    </p>}
  </>;
}
