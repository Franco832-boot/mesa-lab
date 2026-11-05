import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { BoardProgram } from '../../model/types';
import {
  MAX_PROGRAM_FILES,
  MAX_PROGRAM_SOURCE_LENGTH,
  selectedSourceFile,
  sourceFiles,
  validSourceName,
} from '../../model/programFiles';
import type { ProgramFileAction } from '../../model/programFiles';
import { useLocale } from '../../locales/useLocale';
import { Dialog } from '../../shared/Dialog';
import { BoardHeader } from './BoardHeader';
import type { ContextBoard } from './boardContext';
import { boardDisplayLabel } from './boardContext';

function BoardFiles({
  board,
  program,
  onChange,
  onFileAction,
}: {
  board: ContextBoard;
  program: BoardProgram | undefined;
  onChange: (source: string) => void;
  onFileAction: ((action: ProgramFileAction) => boolean) | undefined;
}) {
  const { t, locale } = useLocale();
  const files = sourceFiles(program),
    active = selectedSourceFile(program);
  const [operation, setOperation] = useState<'create' | 'rename' | 'delete' | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState(false);
  const tabs = useRef(new Map<string, HTMLButtonElement>());
  const apply = (action: ProgramFileAction) => {
    const result = onFileAction?.(action) ?? false;
    setError(!result);
    return result;
  };
  const choose = (file: string) => apply({ type: 'select', name: file });
  const editLimit =
    MAX_PROGRAM_SOURCE_LENGTH -
    files.reduce((sum, file) => sum + (file.name === active?.name ? 0 : file.source.length), 0);
  const start = (next: 'create' | 'rename' | 'delete') => {
    setError(false);
    setName(next === 'create' ? '' : (active?.name ?? ''));
    setOperation(next);
  };
  return (
    <>
      <div className="code-file-actions">
        <button
          type="button"
          className="secondary-button"
          data-testid="code-file-create"
          disabled={!onFileAction || files.length >= MAX_PROGRAM_FILES}
          onClick={() => start('create')}
        >
          {t('codeFileCreate')}
        </button>
        <button
          type="button"
          className="text-button"
          data-testid="code-file-rename"
          disabled={!onFileAction || !active}
          onClick={() => start('rename')}
        >
          {t('codeFileRename')}
        </button>
        <button
          type="button"
          className="text-button"
          data-testid="code-file-delete"
          disabled={!onFileAction || !active}
          onClick={() => start('delete')}
        >
          {t('codeFileDelete')}
        </button>
        <span>.ino · .h · .cpp · .html · .css · .js</span>
      </div>
      <div role="tablist" aria-label={t('codeSourceFiles')} className="code-file-tabs">
        {files.map((file, index) => (
          <button
            key={file.name}
            type="button"
            role="tab"
            data-testid="code-file-tab"
            aria-controls={`code-document-${encodeURIComponent(board.id)}`}
            aria-selected={file.name === active?.name}
            tabIndex={file.name === active?.name ? 0 : -1}
            ref={(node) => {
              if (node) tabs.current.set(file.name, node);
              else tabs.current.delete(file.name);
            }}
            onClick={() => choose(file.name)}
            onKeyDown={(event) => {
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? files.length - 1
                    : event.key === 'ArrowRight'
                      ? (index + 1) % files.length
                      : event.key === 'ArrowLeft'
                        ? (index + files.length - 1) % files.length
                        : null;
              const target = next === null ? undefined : files[next];
              if (target) {
                event.preventDefault();
                choose(target.name);
                tabs.current.get(target.name)?.focus();
              }
            }}
          >
            {file.name}
          </button>
        ))}
      </div>
      <div className="code-files-body">
        <details className="code-file-explorer" open>
          <summary>{t('codeSourceFiles')}</summary>
          <nav aria-label={t('codeSourceFiles')}>
            {files.map((file) => (
              <button
                key={file.name}
                type="button"
                aria-current={file.name === active?.name ? 'page' : undefined}
                onClick={() => choose(file.name)}
              >
                {file.name}
              </button>
            ))}
          </nav>
        </details>
        {active ? (
          <div
            role="tabpanel"
            id={`code-document-${encodeURIComponent(board.id)}`}
            aria-label={active.name}
            className="code-document"
          >
            <span className="code-document-name">{active.name}</span>
            <textarea
              data-testid="board-code-editor"
              aria-label={`${t('boardSource')} · ${board.id} · ${active.name}`}
              value={active.source}
              onChange={(event) => {
                if (onFileAction)
                  apply({ type: 'edit', name: active.name, source: event.target.value });
                else onChange(event.target.value);
              }}
              maxLength={editLimit}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              wrap="off"
            />
          </div>
        ) : (
          <p className="tool-empty">{t('codeFilesEmpty')}</p>
        )}
      </div>
      <div className="board-code-footer">
        <span>{active?.name ?? t('codeFilesEmpty')}</span>
        <output>
          {new Intl.NumberFormat(locale).format(
            files.reduce((sum, file) => sum + file.source.length, 0),
          )}{' '}
          / {MAX_PROGRAM_SOURCE_LENGTH} {t('programCharacters')}
        </output>
      </div>
      {error && !operation && (
        <p role="alert" className="iot-error">
          {t('codeFileError')}
        </p>
      )}
      {operation && (
        <Dialog
          title={t(
            operation === 'create'
              ? 'codeFileCreate'
              : operation === 'rename'
                ? 'codeFileRename'
                : 'codeFileDelete',
          )}
          onClose={() => setOperation(null)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (operation === 'delete') {
                if (apply({ type: 'delete', name })) setOperation(null);
                return;
              }
              if (!validSourceName(name)) {
                setError(true);
                return;
              }
              const action: ProgramFileAction =
                operation === 'create'
                  ? { type: 'create', name }
                  : { type: 'rename', name: active?.name ?? '', nextName: name };
              if (apply(action)) setOperation(null);
            }}
          >
            {operation === 'delete' ? (
              <p>
                {t('codeFileDeleteConfirm')} <strong>{name}</strong>
              </p>
            ) : (
              <label className="iot-field">
                <span>{t('codeFileName')}</span>
                <input
                  data-testid="code-file-name"
                  autoFocus
                  value={name}
                  maxLength={80}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="config.h"
                />
              </label>
            )}
            {error && (
              <p role="alert" className="iot-error">
                {t('codeFileError')}
              </p>
            )}
            <div className="dialog-actions">
              <button type="button" className="secondary-button" onClick={() => setOperation(null)}>
                {t('cancel')}
              </button>
              <button type="submit" className="primary-button" data-testid="code-file-confirm">
                {t(operation === 'delete' ? 'codeFileDelete' : 'codeFileApply')}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}

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
}) {
  const { t } = useLocale();
  const boardTabs = useRef(new Map<string, HTMLButtonElement>());
  const ownProgram = program?.componentId === activeBoard?.id ? program : undefined;
  return (
    <section
      className="board-code-workspace"
      data-testid="code-workspace"
      data-workspace-tool
      aria-label={t('boardCodeTitle')}
    >
      <div className="code-workspace-title">
        <strong>{t('boardCodeTitle')}</strong>
        <span role="status">
          {t(
            saveStatus === 'saved'
              ? 'codeFilesSaved'
              : saveStatus === 'saving'
                ? 'codeFilesSaving'
                : 'codeFilesSaveError',
          )}
        </span>
        {onClose && (
          <button type="button" className="text-button" aria-label={t('close')} onClick={onClose}>
            ×
          </button>
        )}
      </div>
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
      {!activeBoard ? (
        <BoardHeader components={boards} activeBoardId={undefined} onSelect={onSelectBoard} />
      ) : (
        <div
          className="code-selected-board"
          id="code-selected-board"
          role="tabpanel"
          aria-label={boardDisplayLabel(activeBoard, boards)}
        >
          <BoardFiles
            key={activeBoard.id}
            board={activeBoard}
            program={ownProgram}
            onChange={onChange}
            onFileAction={onFileAction}
          />
        </div>
      )}
      {status && <div className="code-network-status">{status}</div>}
      <p className="code-editing-note">{t('boardCodeExecutionNote')}</p>
    </section>
  );
}
