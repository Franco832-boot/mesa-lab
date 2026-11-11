import { useEffect, useMemo, useRef, useState } from 'react';
import type { PreviewRequest } from './simulationPreview';
import { EspChatSimulation } from './EspChatSimulation';
import type { EspChatRuntime } from './EspChatSimulation';
import { usesTelegramBot } from '../../firmware/projectCompiler';
import { sourceFiles } from '../../model/programFiles';
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

type EditorSection = EspCodeSection | 'chat';
const chatSections: readonly EditorSection[] = [...ESP_CODE_SECTIONS, 'chat'];
const labels: Record<EditorSection, TranslationKey> = {
  main: 'espCodeMain', wifi: 'espCodeWifi', functions: 'espCodeFunctions',
  server: 'espCodeServer', html: 'espCodeHtml', web: 'espWebView', chat: 'espChatTab',
};
export function EspProjectEditor({ board, program, explorerOpen, onToggleExplorer, onChange, onFileAction, web, chat, onRevealPreview, openedSessions, previewRequest }: {
  board: ContextBoard;
  program: BoardProgram | undefined;
  explorerOpen: boolean;
  onToggleExplorer: () => void;
  onChange: (source: string) => void;
  onFileAction: ((action: ProgramFileAction) => boolean) | undefined;
  web: EspWebRuntime | undefined;
  chat: EspChatRuntime | undefined;
  onRevealPreview: (() => void) | undefined;
  openedSessions: WeakSet<FirmwareSession>;
  previewRequest: PreviewRequest | undefined;
}) {
  const { t } = useLocale();
  const [utility, setUtility] = useState<'web' | 'chat' | null>(null);
  const [error, setError] = useState(false);
  const tabs = useRef(new Map<EditorSection, HTMLButtonElement>());
  const hasChat = useMemo(() => usesTelegramBot(sourceFiles(program)), [program]);
  const sections = hasChat ? chatSections : ESP_CODE_SECTIONS;
  const active = utility === 'chat' && !hasChat ? activeEspSection(program) : utility ?? activeEspSection(program);
  const prefix = `esp-code-${encodeURIComponent(board.id)}`;
  useEffect(() => {
    if (previewRequest && (previewRequest.section !== 'chat' || hasChat)) setUtility(previewRequest.section);
  }, [previewRequest, hasChat]);
  useEffect(() => {
    tabs.current.get(active)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
  }, [active]);
  const choose = (section: EditorSection) => {
    if (section === 'web' || section === 'chat') { setUtility(section); setError(false); onRevealPreview?.(); return; }
    const success = onFileAction?.(openEspSection(section, program)) ?? false;
    setError(!success);
    if (success) setUtility(null);
  };
  return <>
    <div className="esp-code-sections" role="tablist" aria-label={t('espCodeSections')}>
      {sections.map((section, index) => <button key={section} type="button" role="tab"
        id={`${prefix}-${section}`} data-testid={`esp-code-tab-${section}`}
        aria-selected={active === section} aria-controls={`${prefix}-panel`}
        tabIndex={active === section ? 0 : -1}
        ref={(node) => { if (node) tabs.current.set(section, node); else tabs.current.delete(section); }}
        onClick={() => choose(section)} onKeyDown={(event) => {
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? sections.length - 1
            : event.key === 'ArrowRight' ? (index + 1) % sections.length
              : event.key === 'ArrowLeft' ? (index + sections.length - 1) % sections.length : null;
          const target = next === null ? undefined : sections[next];
          if (target) { event.preventDefault(); choose(target); tabs.current.get(target)?.focus(); }
        }}>{t(labels[section])}</button>)}
    </div>
    {error && <p role="alert" className="iot-error">{t('codeFileError')}</p>}
    <div className="esp-code-section-panel" role="tabpanel" id={`${prefix}-panel`} aria-labelledby={`${prefix}-${active}`}>
      {web && <EspWebPreview {...web} visible={active === 'web'} openedSessions={openedSessions}
        onAutoOpen={() => { if (!hasChat) { setUtility('web'); onRevealPreview?.(); } }} onClose={() => setUtility(null)} />}
      {active === 'web' && !web && <p>{t('espWebUnavailable')}</p>}
      {active === 'chat' && <EspChatSimulation key={chat?.status === 'stopped' ? 'stopped' : 'session'} runtime={chat} />}
      {active === 'web' || active === 'chat' ? null : <CodeFilesEditor board={board} program={program} section={active}
        explorerOpen={explorerOpen} onToggleExplorer={onToggleExplorer} onChange={onChange} onFileAction={onFileAction} />}
    </div>
  </>;
}
