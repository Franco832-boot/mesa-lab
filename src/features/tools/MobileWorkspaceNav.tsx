import { useLocale } from '../../locales/useLocale';
import type { TranslationKey } from '../../locales/es/messages';
import { Icon } from '../../shared/Icon';
import type { IconName } from '../../shared/Icon';
import type { MobilePanel } from './useWorkspacePanels';

const panels: readonly { panel: MobilePanel | null; label: TranslationKey; icon: IconName; controls?: string }[] = [
  { panel: null, label: 'mobileDesk', icon: 'grid' },
  { panel: 'projects', label: 'projects', icon: 'folder', controls: 'example-projects' },
  { panel: 'components', label: 'library', icon: 'chip', controls: 'workspace-tools' },
  { panel: 'code', label: 'codeTab', icon: 'code', controls: 'workspace-tools' },
  { panel: 'inspector', label: 'properties', icon: 'inspector', controls: 'context-inspector' },
];

export function MobileWorkspaceNav({ active, hasSelection, onSelect }: {
  active: MobilePanel | null;
  hasSelection: boolean;
  onSelect: (panel: MobilePanel | null) => void;
}) {
  const { t } = useLocale();
  return <nav className="mobile-workspace-nav" aria-label={t('mobilePanelNavigation')}>
    {panels.map(({ panel, label, icon, controls }) => <button key={panel ?? 'desk'} type="button"
      data-testid={`mobile-panel-${panel ?? 'desk'}`} aria-pressed={active === panel}
      aria-expanded={panel === null ? undefined : active === panel} aria-controls={controls}
      disabled={panel === 'inspector' && !hasSelection}
      title={t(panel === 'inspector' && !hasSelection ? 'selectToEdit' : label)}
      onClick={() => onSelect(active === panel ? null : panel)}>
      <Icon name={icon} size={19} /><span>{t(label)}</span>
    </button>)}
  </nav>;
}
