import { useRef, useState } from 'react';
import type { BoardProgram } from '../../model/types';
import { MAX_PROGRAM_FILES, MAX_PROGRAM_SOURCE_LENGTH, selectedSourceFile, sourceFiles, validSourceName } from '../../model/programFiles';
import type { ProgramFileAction } from '../../model/programFiles';
import { espFileSection } from '../../model/espProjectFiles';
import type { EspFileSection } from '../../model/espProjectFiles';
import { useLocale } from '../../locales/useLocale';
import { Dialog } from '../../shared/Dialog';
import { Icon } from '../../shared/Icon';
import type { ContextBoard } from './boardContext';

export function CodeFilesEditor({
  board,
  program,
  explorerOpen,
  onToggleExplorer,
  onChange,
  onFileAction,
  section,
}: {
  board: ContextBoard;
  program: BoardProgram | undefined;
  explorerOpen: boolean;
  onToggleExplorer: () => void;
  onChange: (source: string) => void;
  onFileAction: ((action: ProgramFileAction) => boolean) | undefined;
  section?: EspFileSection;
}) {
  const { t, locale } = useLocale();
  const files = sourceFiles(program),
    active = selectedSourceFile(program);
  const visibleFiles = section ? files.filter((file) => espFileSection(file.name) === section) : files;
  const [operation, setOperation] = useState<'create' | 'rename' | 'delete' | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState(false);
  const tabs = useRef(new Map<string, HTMLButtonElement>());
  const explorerId = `code-file-explorer-${encodeURIComponent(board.id)}`;
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
      <div className="code-file-header">
        <button
          type="button"
          className={`icon-button ${explorerOpen ? 'active-subtle' : ''}`}
          data-testid="code-file-explorer-toggle"
          aria-label={t('codeSourceFiles')}
          title={t('codeSourceFiles')}
          aria-expanded={explorerOpen}
          aria-controls={explorerId}
          onClick={onToggleExplorer}
        >
          <Icon name="folder" />
        </button>
        <div role="tablist" aria-label={t('codeSourceFiles')} className="code-file-tabs">
          {visibleFiles.map((file, index) => (
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
                      ? visibleFiles.length - 1
                      : event.key === 'ArrowRight'
                        ? (index + 1) % visibleFiles.length
                        : event.key === 'ArrowLeft'
                          ? (index + visibleFiles.length - 1) % visibleFiles.length
                          : null;
                const target = next === null ? undefined : visibleFiles[next];
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
      </div>
      <div className="code-files-body">
        <aside
          id={explorerId}
          className="code-file-explorer"
          data-testid="code-file-explorer"
          aria-label={t('codeSourceFiles')}
          hidden={!explorerOpen}
        >
          <div className="code-file-explorer-heading">{t('codeSourceFiles')}</div>
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
        </aside>
        {active ? (
          <div
            role="tabpanel"
            id={`code-document-${encodeURIComponent(board.id)}`}
            aria-label={active.name}
            className="code-document"
          >
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

