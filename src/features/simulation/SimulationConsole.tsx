import { useLocale } from '../../locales/useLocale';
import type { TranslationKey } from '../../locales/es/messages';
import type { ElectronicComponent } from '../../model/types';
import type { SimulationIssue } from '../../sim/types';
import { Icon } from '../../shared/Icon';
import { DiagnosticsPanel } from './DiagnosticsPanel';
import { groupDiagnostics } from './diagnostics';
import { statusMessages } from './messages';
import type { SimulationStatus } from './runtime';

interface SimulationConsoleProps {
  open: boolean;
  onToggle: () => void;
  status: SimulationStatus;
  locked: boolean;
  diagnostics: readonly SimulationIssue[] | null;
  initialIssue: TranslationKey | null;
  components: readonly ElectronicComponent[];
  onNavigate: (ids: readonly string[]) => void;
}

export function SimulationConsole({
  open,
  onToggle,
  status,
  locked,
  diagnostics,
  initialIssue,
  components,
  onNavigate,
}: SimulationConsoleProps) {
  const { t } = useLocale();
  return (
    <div className={`console-panel ${open ? 'open' : ''}`}>
      <button
        className="console-toggle"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls="console-messages"
      >
        <span>
          <Icon name="terminal" size={15} />
          {t('console')}
          <span className="console-count">
            {groupDiagnostics(diagnostics ?? []).length}
          </span>
        </span>
        <span className="console-right">
          {t(statusMessages[status])}
          <Icon name={open ? 'down' : 'chevron'} size={14} />
        </span>
      </button>
      {open && (
        <div id="console-messages" className="console-message">
          <div
            className="simulation-diagnostics"
            data-testid="simulation-diagnostics"
            aria-live="polite"
          >
            <p>{t(locked ? 'simulationLocked' : 'simulationReady')}</p>
            {initialIssue && <p>{t(initialIssue)}</p>}
            {diagnostics && (
              <DiagnosticsPanel
                diagnostics={diagnostics}
                components={components}
                onNavigate={onNavigate}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
