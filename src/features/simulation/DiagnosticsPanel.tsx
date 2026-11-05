import { useMemo } from 'react';
import type { ElectronicComponent } from '../../model/types';
import type { SimulationIssue } from '../../sim/types';
import { useLocale } from '../../locales/useLocale';
import { getCatalogEntry } from '../components/catalog';
import { diagnosticMessages, severityMessages } from './messages';
import { diagnosticGuidance, diagnosticRelatedComponents, groupDiagnostics } from './diagnostics';

/** Presents electrical evidence and forwards navigation without changing the circuit or evaluating it. */
export function DiagnosticsPanel({ diagnostics, components, onNavigate }: {
  diagnostics: readonly SimulationIssue[];
  components: readonly ElectronicComponent[];
  onNavigate: (ids: readonly string[]) => void;
}) {
  const { t, locale } = useLocale();
  const grouped = useMemo(() => groupDiagnostics(diagnostics), [diagnostics]);
  if (!grouped.length) return <p>{t('diagnosticsEmpty')}</p>;
  return (
    <ul className="diagnostic-list">
      {grouped.map(({ key, issue, count }) => {
        const related = diagnosticRelatedComponents(issue, components);
        const names = related.map((component) => `${t(getCatalogEntry(component.kind).name)} · ${component.id}`);
        const guidance = diagnosticGuidance[issue.code];
        return (
          <li key={key} className="diagnostic-card" data-severity={issue.severity} data-code={issue.code}>
            <p className="diagnostic-summary">
              <strong>{t(severityMessages[issue.severity])}: </strong>{t(diagnosticMessages[issue.code])}
            </p>
            {count > 1 && <span className="diagnostic-repeat">{t('diagnosticRepeated')}: {new Intl.NumberFormat(locale).format(count)}</span>}
            {names.length > 0 && <p className="diagnostic-components">{names.join(', ')}</p>}
            <dl className="diagnostic-guidance">
              <div><dt>{t('diagnosticWhy')}</dt><dd>{t(guidance.why)}</dd></div>
              <div><dt>{t('diagnosticAction')}</dt><dd>{t(guidance.action)}</dd></div>
            </dl>
            {related.length > 0 && (
              <button type="button" className="secondary-button diagnostic-navigate" data-testid="diagnostic-navigate"
                aria-label={`${t('diagnosticNavigate')} · ${names.join(', ')}`}
                onClick={() => onNavigate(related.map((component) => component.id))}>
                {t('diagnosticNavigate')}
              </button>
            )}
            <details className="diagnostic-details">
              <summary>{t('diagnosticDetails')}</summary>
              <dl>
                <div><dt>{t('diagnosticCode')}</dt><dd><code>{issue.code}</code></dd></div>
                {issue.componentIds.length > 0 && <div><dt>{t('diagnosticComponentIds')}</dt><dd><code>{issue.componentIds.join(', ')}</code></dd></div>}
                {issue.pinIds.length > 0 && <div><dt>{t('diagnosticPinIds')}</dt><dd><code>{issue.pinIds.join(', ')}</code></dd></div>}
              </dl>
            </details>
          </li>
        );
      })}
    </ul>
  );
}
