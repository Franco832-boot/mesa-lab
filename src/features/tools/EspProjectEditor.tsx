import { useRef, useState } from 'react';
import { EspWebPreview } from './EspWebPreview';
import type { EspWebRuntime } from './EspWebPreview';
import type { FirmwareSession } from '../simulation/firmwareRuntime';
import type { BoardProgram } from '../../model/types';
import type { ProgramFileAction } from '../../model/programFiles';
import { activeEspSection, ESP_CODE_SECTIONS, openEspSection } from '../../model/espProjectFiles';
import type { EspCodeSection } from '../../model/espProjectFiles';
import { useLocale } from '../../locales/useLocale';
import type { TranslationKey } from '../../locales/es/messages';
import type { ContextBoard } from './boardContext';
import { CodeFilesEditor } from './CodeFilesEditor';

const labels: Record<EspCodeSection, TranslationKey> = {
  main: 'espCodeMain', wifi: 'espCodeWifi', functions: 'espCodeFunctions',
  server: 'espCodeServer', html: 'espCodeHtml', web: 'espWebView',
};
export function EspProjectEditor({ board, program, explorerOpen, onToggleExplorer, onChange, onFileAction, web, onRevealWeb, openedSessions }: {
  board: ContextBoard;
  program: BoardProgram | undefined;
  explorerOpen: boolean;
  onToggleExplorer: () => void;
  onChange: (source: string) => void;
  onFileAction: ((action: ProgramFileAction) => boolean) | undefined;
  web: EspWebRuntime | undefined;
  onRevealWeb: (() => void) | undefined;
  openedSessions: WeakSet<FirmwareSession>;
}) {
  const { t } = useLocale();
  const [utility, setUtility] = useState<'web' | null>(null);
  const [error, setError] = useState(false);
  const tabs = useRef(new Map<EspCodeSection, HTMLButtonElement>());
  const active = utility ?? activeEspSection(program);
  const prefix = `esp-code-${encodeURIComponent(board.id)}`;
  const choose = (section: EspCodeSection) => {
    if (section === 'web') { setUtility('web'); setError(false); onRevealWeb?.(); return; }
    const success = onFileAction?.(openEspSection(section, program)) ?? false;
    setError(!success);
    if (success) setUtility(null);
  };
  return <>
    <div className="esp-code-sections" role="tablist" aria-label={t('espCodeSections')}>
      {ESP_CODE_SECTIONS.map((section, index) => <button key={section} type="button" role="tab"
        id={`${prefix}-${section}`} data-testid={`esp-code-tab-${section}`}
        aria-selected={active === section} aria-controls={`${prefix}-panel`}
        tabIndex={active === section ? 0 : -1}
        ref={(node) => { if (node) tabs.current.set(section, node); else tabs.current.delete(section); }}
        onClick={() => choose(section)} onKeyDown={(event) => {
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? ESP_CODE_SECTIONS.length - 1
            : event.key === 'ArrowRight' ? (index + 1) % ESP_CODE_SECTIONS.length
              : event.key === 'ArrowLeft' ? (index + ESP_CODE_SECTIONS.length - 1) % ESP_CODE_SECTIONS.length : null;
          const target = next === null ? undefined : ESP_CODE_SECTIONS[next];
          if (target) { event.preventDefault(); choose(target); tabs.current.get(target)?.focus(); }
        }}>{t(labels[section])}</button>)}
    </div>
    {error && <p role="alert" className="iot-error">{t('codeFileError')}</p>}
    <div className="esp-code-section-panel" role="tabpanel" id={`${prefix}-panel`} aria-labelledby={`${prefix}-${active}`}>
      {web && <EspWebPreview {...web} visible={active === 'web'} openedSessions={openedSessions}
        onAutoOpen={() => { setUtility('web'); onRevealWeb?.(); }} onClose={() => setUtility(null)} />}
      {active === 'web' && !web && <p>{t('espWebUnavailable')}</p>}
      {active === 'web' ? null : <CodeFilesEditor board={board} program={program} section={active}
        explorerOpen={explorerOpen} onToggleExplorer={onToggleExplorer} onChange={onChange} onFileAction={onFileAction} />}
    </div>
  </>;
}
