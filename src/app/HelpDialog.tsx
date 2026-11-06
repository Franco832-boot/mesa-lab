import { useLocale } from '../locales/useLocale';
import { Dialog } from '../shared/Dialog';
import { Icon } from '../shared/Icon';

const roadmapKeys = [
  'roadmap1',
  'roadmap2',
  'roadmap3',
  'roadmap4',
  'roadmap5',
  'roadmap6',
] as const;

export function HelpDialog({ onClose }: { onClose: () => void }) {
  const { t } = useLocale();
  return (
    <Dialog title={t('helpTitle')} onClose={onClose}>
      <p className="dialog-intro">{t('helpIntro')}</p>
      <div className="help-gestures">
        <Icon name="hand" />
        <div>
          <h3>{t('helpGestures')}</h3>
          <p>{t('helpGestureDetail')}</p>
        </div>
      </div>
      <ol className="roadmap-list">
        {roadmapKeys.map((key, i) => (
          <li key={key} className={i === 3 ? 'current' : ''}>
            <span className="roadmap-number">0{i + 1}</span>
            <p>{t(key)}</p>
            {i === 3 && <span className="small-tag">{t('current')}</span>}
          </li>
        ))}
      </ol>
      <button className="primary-button dialog-done" onClick={onClose}>
        {t('done')}
        <Icon name="check" size={16} />
      </button>
    </Dialog>
  );
}
