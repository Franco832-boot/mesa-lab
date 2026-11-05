import type { ReactNode } from 'react';
import { isBoardComponent } from '../../model/components';
import type { ElectronicComponent } from '../../model/types';
import { useLocale } from '../../locales/useLocale';
import { boardDisplayLabel } from './boardContext';

export function BoardHeader({ components, activeBoardId, onSelect, children, status }: {
  components: readonly ElectronicComponent[];
  activeBoardId: string | undefined;
  onSelect: (id: string) => void;
  children?: ReactNode;
  status?: ReactNode;
}) {
  const { t } = useLocale();
  const boards = components.filter(isBoardComponent);
  const active = boards.find((board) => board.id === activeBoardId);
  return (
    <header className="board-context-header" data-testid="board-context-header" data-board-id={active?.id}>
      <div className="board-context-title" aria-live="polite">
        <span>{t('activeBoardTitle')}</span>
        {active ? <strong key={active.id} className="board-active-name" data-testid="active-board-name">{boardDisplayLabel(active, boards)}</strong> : <p>{t('boardToolsEmpty')}</p>}
      </div>
      {boards.length > 1 && (
        <label className="board-context-selector">
          <span>{t('chooseActiveBoard')}</span>
          <select aria-label={t('chooseActiveBoard')} data-testid="board-selector" value={active?.id ?? ''}
            onChange={(event) => onSelect(event.target.value)}>
            {!active && <option value="" disabled>{t('chooseActiveBoard')}</option>}
            {boards.map((board) => <option key={board.id} value={board.id}>{boardDisplayLabel(board, boards)}</option>)}
          </select>
        </label>
      )}
      {active && <p className="board-capabilities">{t(active.kind === 'esp8266' ? 'espBoardCapabilities' : 'unoBoardCapabilities')}</p>}
      {status !== undefined && status !== null && <div className="board-context-status">{status}</div>}
      {children}
    </header>
  );
}
