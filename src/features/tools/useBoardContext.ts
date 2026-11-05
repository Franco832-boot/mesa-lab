import { useCallback, useEffect, useMemo, useState } from 'react';
import { isBoardComponent } from '../../model/components';
import type { ElectronicComponent } from '../../model/types';
import { initialBoardContext, selectContextBoard, synchronizeBoardContext } from './boardContext';

/** Transient tools context. It stores IDs only; Redux remains the sole circuit/program document. */
export function useBoardContext(
  projectIdentity: string,
  components: readonly ElectronicComponent[],
  selectedComponentId: string | null | undefined,
) {
  const [context, setContext] = useState(() => initialBoardContext(projectIdentity, components, selectedComponentId));
  const boards = useMemo(() => components.filter(isBoardComponent), [components]);
  const effective = synchronizeBoardContext(context, projectIdentity, components, selectedComponentId);
  useEffect(() => {
    setContext((previous) => synchronizeBoardContext(previous, projectIdentity, components, selectedComponentId));
  }, [projectIdentity, components, selectedComponentId]);
  const selectBoard = useCallback((id: string) => {
    setContext((previous) => selectContextBoard(
      synchronizeBoardContext(previous, projectIdentity, components, selectedComponentId), id, components,
    ));
  }, [projectIdentity, components, selectedComponentId]);
  const onCanvasSelection = useCallback((id: string | null | undefined) => {
    setContext((previous) => selectContextBoard(
      synchronizeBoardContext(previous, projectIdentity, components, selectedComponentId), id, components,
    ));
  }, [projectIdentity, components, selectedComponentId]);
  return { activeBoard: boards.find((board) => board.id === effective.activeBoardId), boards, selectBoard, onCanvasSelection };
}
