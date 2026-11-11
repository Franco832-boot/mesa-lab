import type { EspChatRuntime } from './EspChatSimulation';
import type { EspWebRuntime } from './EspWebPreview';
import type { FirmwareSession } from '../simulation/firmwareRuntime';
import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { BoardProgram } from '../../model/types';
import type { ProgramFileAction } from '../../model/programFiles';
import { useLocale } from '../../locales/useLocale';
import { BoardHeader } from './BoardHeader';
import { CodeFilesEditor } from './CodeFilesEditor';
import { EspProjectEditor } from './EspProjectEditor';
import type { ContextBoard } from './boardContext';
import { boardDisplayLabel } from './boardContext';

export function CodeWorkspace({
  boards,
  activeBoard,
  program,
  onSelectBoard,
  onChange,
  onFileAction,
  status,
  saveStatus = 'saved',
  onClose,
  web,
  chat,
  onRevealPreview,
}: {
  boards: readonly ContextBoard[];
  activeBoard: ContextBoard | undefined;
  program: BoardProgram | undefined;
  onSelectBoard: (id: string) => void;
  onChange: (source: string) => void;
  onFileAction?: (action: ProgramFileAction) => boolean;
  status?: ReactNode;
  saveStatus?: 'saving' | 'saved' | 'error';
  onClose?: () => void;
  web?: EspWebRuntime | undefined;
  chat?: EspChatRuntime | undefined;
  onRevealPreview?: (() => void) | undefined;
}) {
  const { t } = useLocale();
  const openedSessions = useRef(new WeakSet<FirmwareSession>());
  const boardTabs = useRef(new Map<string, HTMLButtonElement>());
  const [explorerOpen, setExplorerOpen] = useState(false);
  const ownProgram = program?.componentId === activeBoard?.id ? program : undefined;
  return (
    <section
      className="board-code-workspace"
      data-testid="code-workspace"
      data-workspace-tool
      aria-label={t('boardCodeTitle')}
    >
      <div className="code-workspace-header">
        <div role="tablist" className="code-board-tabs" aria-label={t('chooseActiveBoard')}>
          {boards.map((board, index) => (
            <button
              key={board.id}
              type="button"
              role="tab"
              data-testid="code-board-tab"
              title={t(
                board.kind === 'arduino-uno' ? 'unoBoardCapabilities' : 'espBoardCapabilities',
              )}
              aria-controls="code-selected-board"
              data-board-id={board.id}
              aria-selected={board.id === activeBoard?.id}
              tabIndex={board.id === activeBoard?.id ? 0 : -1}
              ref={(node) => {
                if (node) boardTabs.current.set(board.id, node);
                else boardTabs.current.delete(board.id);
              }}
              onClick={() => onSelectBoard(board.id)}
              onKeyDown={(event) => {
                const next =
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? boards.length - 1
                      : event.key === 'ArrowRight'
                        ? (index + 1) % boards.length
                        : event.key === 'ArrowLeft'
                          ? (index + boards.length - 1) % boards.length
                          : null;
                const target = next === null ? undefined : boards[next];
                if (target) {
                  event.preventDefault();
                  onSelectBoard(target.id);
                  boardTabs.current.get(target.id)?.focus();
                }
              }}
            >
              {boardDisplayLabel(board, boards)}
            </button>
          ))}
        </div>
        {onClose && (
          <button type="button" className="text-button" aria-label={t('close')} onClick={onClose}>
            ×
          </button>
        )}
        <span className="code-save-state" role="status">
          {t(
            saveStatus === 'saved'
              ? 'codeFilesSaved'
              : saveStatus === 'saving'
                ? 'codeFilesSaving'
                : 'codeFilesSaveError',
          )}
        </span>
      </div>
      {!activeBoard ? (
        <BoardHeader components={boards} activeBoardId={undefined} onSelect={onSelectBoard} />
      ) : (
        <div
          className={`code-selected-board${activeBoard.kind === 'esp8266' ? ' code-selected-board--esp' : ''}`}
          id="code-selected-board"
          role="tabpanel"
          aria-label={boardDisplayLabel(activeBoard, boards)}
        >
          {activeBoard.kind === 'esp8266' ? <EspProjectEditor
            key={activeBoard.id}
            board={activeBoard}
            program={ownProgram}
            explorerOpen={explorerOpen}
            onToggleExplorer={() => setExplorerOpen((previous) => !previous)}
            onChange={onChange}
            onFileAction={onFileAction}
            web={web}
            chat={chat}
            onRevealPreview={onRevealPreview}
            openedSessions={openedSessions.current}
          /> : <CodeFilesEditor
            key={activeBoard.id}
            board={activeBoard}
            program={ownProgram}
            explorerOpen={explorerOpen}
            onToggleExplorer={() => setExplorerOpen((previous) => !previous)}
            onChange={onChange}
            onFileAction={onFileAction}
          />}
        </div>
      )}
      {status && <div className="code-network-status">{status}</div>}
      {activeBoard?.kind !== 'esp8266' && <p className="code-editing-note">{t('boardCodeExecutionNote')}</p>}
    </section>
  );
}
