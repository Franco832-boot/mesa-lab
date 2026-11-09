import { useMemo, useState } from 'react';
import type { CircuitProject } from '../../model/types';
import { isBoardComponent } from '../../model/components';
import { sourceFiles } from '../../model/programFiles';
import { Dialog } from '../../shared/Dialog';
import { useLocale } from '../../locales/useLocale';
import type { TranslationKey } from '../../locales/es/messages';
import { boardDisplayLabel } from '../tools/boardContext';
import { CodeExportError, defaultMainFile, prepareCodeExport } from './prepareCodeExport';
import type { CodeExportErrorCode, ExportWarningKind } from './prepareCodeExport';
import { textZip } from './zip';
const warningLabels: Record<ExportWarningKind, TranslationKey> = {
  credentials: 'codeExportCredentials', 'exclusive-api': 'codeExportExclusive', 'missing-local': 'codeExportMissingLocal',
  'web-omitted': 'codeExportWebOmitted', 'board-library': 'codeExportBoardLibrary', 'ide-name': 'codeExportIdeName', 'multiple-ino': 'codeExportMultipleIno',
};
const errorLabels: Record<CodeExportErrorCode, TranslationKey> = {
  empty: 'codeExportEmpty', 'missing-ino': 'codeExportMissingIno', 'invalid-name': 'codeExportInvalidName', limit: 'codeExportLimit',
};
export function CodeExportDialog({ project, initialBoardId, onClose, onDownloaded }: {
  project: CircuitProject; initialBoardId: string | undefined; onClose: () => void; onDownloaded: () => void;
}) {
  const { t, locale } = useLocale();
  const boards = project.components.filter(isBoardComponent);
  const [boardId, setBoardId] = useState(initialBoardId ?? boards[0]?.id ?? '');
  const [main, setMain] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [failed, setFailed] = useState(false);
  const board = boards.find(item => item.id === boardId);
  const program = project.programs.find(item => item.componentId === board?.id);
  const chosenMain = main || defaultMainFile(program);
  const result = useMemo(() => {
    if (!board) return { plan: null, error: 'codeExportNoBoard' as const };
    try { return { plan: prepareCodeExport({ program, board: board.kind, projectName: project.name, locale, main: chosenMain }), error: null }; }
    catch (error: unknown) { return { plan: null, error: error instanceof CodeExportError ? errorLabels[error.code] : 'codeExportError' as const }; }
  }, [board, program, chosenMain, project.name, locale]);
  const credentials = result.plan?.warnings.some(warning => warning.kind === 'credentials') ?? false;
  const download = () => {
    if (!result.plan || (credentials && !accepted)) return;
    let url: string | undefined;
    try {
      url = URL.createObjectURL(new Blob([textZip(result.plan.files)], { type: 'application/zip' }));
      const link = document.createElement('a'); link.href = url; link.download = result.plan.downloadName;
      document.body.append(link);
      try { link.click(); } finally { link.remove(); }
      const downloadedUrl = url; window.setTimeout(() => URL.revokeObjectURL(downloadedUrl), 1000);
      onDownloaded();
    } catch { if (url) URL.revokeObjectURL(url); setFailed(true); }
  };
  return <Dialog title={t('exportCode')} onClose={onClose} className="code-export-dialog">
    <p className="dialog-intro">{t('codeExportIntro')}</p>
    <div className="code-export-fields">
      <label>{t('codeExportBoard')}<select data-testid="code-export-board" value={boardId} onChange={event => { setBoardId(event.target.value); setMain(''); setAccepted(false); setFailed(false); }}>
        {boards.map(item => <option key={item.id} value={item.id}>{boardDisplayLabel(item, boards)}</option>)}
      </select></label>
      <label>{t('codeExportMain')}<select data-testid="code-export-main" value={chosenMain} onChange={event => { setMain(event.target.value); setAccepted(false); setFailed(false); }}>
        {sourceFiles(program).filter(file => file.name.endsWith('.ino')).map(file => <option key={file.name}>{file.name}</option>)}
      </select></label>
    </div>
    {result.error && <p role="alert">{t(result.error)}</p>}
    {result.plan && <>
      <p>{t('codeExportCompatibility')}</p>
      <p>{t('codeExportPrivacy')}</p>
      {result.plan.warnings.map(warning => <div className="code-export-warning" key={warning.kind} data-warning={warning.kind}>
        <p>{t(warningLabels[warning.kind])}</p><ul>{warning.details.map(detail => <li key={detail}>{detail}</li>)}</ul>
      </div>)}
      {credentials && <label className="code-export-consent"><input type="checkbox" data-testid="code-export-consent" checked={accepted} onChange={event => setAccepted(event.target.checked)} />{t('codeExportConsent')}</label>}
      <details className="code-export-files"><summary>{t('codeExportFiles')} ({result.plan.files.length})</summary><ul>{result.plan.files.map(file => <li key={file.path}>{file.path}</li>)}</ul></details>
    </>}
    {failed && <p role="alert">{t('codeExportError')}</p>}
    <div className="dialog-actions"><button className="secondary-button" onClick={onClose}>{t('cancel')}</button>
      <button className="primary-button" data-testid="code-export-download" disabled={!result.plan || (credentials && !accepted)} onClick={download}>{t('codeExportDownload')}</button>
    </div>
  </Dialog>;
}
