import { useLocale } from '../locales/useLocale';
import { Dialog } from '../shared/Dialog';
import { Icon } from '../shared/Icon';

const guideSections = [
  ['helpComponents', 'helpComponentsDetail'],
  ['helpWires', 'helpWiresDetail'],
  ['helpBreadboard', 'helpBreadboardDetail'],
  ['helpProjects', 'helpProjectsDetail'],
  ['helpCode', 'helpCodeDetail'],
  ['helpSimulation', 'helpSimulationDetail'],
  ['helpSerial', 'helpSerialDetail'],
  ['helpSensors', 'helpSensorsDetail'],
  ['helpLcd', 'helpLcdDetail'],
  ['helpStorage', 'helpStorageDetail'],
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
      <div className="help-sections">
        {guideSections.map(([title, detail]) => <section key={title} aria-labelledby={`guide-${title}`}>
          <h3 id={`guide-${title}`}>{t(title)}</h3>
          <p>{t(detail)}</p>
        </section>)}
      </div>
      <button className="primary-button dialog-done" onClick={onClose}>
        {t('done')}
        <Icon name="check" size={16} />
      </button>
    </Dialog>
  );
}
