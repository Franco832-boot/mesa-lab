import { useLocale } from '../../locales/useLocale';
import { Icon } from '../../shared/Icon';

export function SimulationNotice() {
  const { t } = useLocale();
  const title = t('simulationNoticeTitle');
  const description = t('simulationNoticeDescription');

  return (
    <aside className="simulation-notice" aria-label={title}>
      <div className="simulation-notice-full">
        <Icon name="info" size={14} />
        <p><strong>{title}</strong> {description}</p>
      </div>
      <details className="simulation-notice-compact">
        <summary>
          <Icon name="info" size={14} />
          <span>{title}</span>
          <Icon name="down" size={12} />
        </summary>
        <p tabIndex={0}>{description}</p>
      </details>
    </aside>
  );
}
