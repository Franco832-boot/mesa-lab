import { isBoardComponent } from '../../model/components';
import type { ElectronicComponent } from '../../model/types';

export type ContextBoard = Extract<ElectronicComponent, { kind: 'arduino-uno' | 'esp8266' }>;
export interface BoardContextState {
  projectIdentity: string;
  activeBoardId: string | null;
  recentBoardIds: readonly string[];
  /** Last observed canvas selection; separate from deliberate board-tool selection. */
  canvasSelectionId: string | null;
}

export function initialBoardContext(
  projectIdentity: string,
  components: readonly ElectronicComponent[],
  selectedComponentId?: string | null,
): BoardContextState {
  const boards = components.filter(isBoardComponent);
  const selected = boards.find((board) => board.id === selectedComponentId);
  return {
    projectIdentity,
    activeBoardId: selected?.id ?? boards[0]?.id ?? null,
    recentBoardIds: selected ? [selected.id] : [],
    canvasSelectionId: selectedComponentId ?? null,
  };
}

/** Remove stale IDs and retain the last compatible selection, then fall back to the first board. */
export function reconcileBoardContext(
  previous: BoardContextState,
  projectIdentity: string,
  components: readonly ElectronicComponent[],
): BoardContextState {
  if (previous.projectIdentity !== projectIdentity) return initialBoardContext(projectIdentity, components);
  const boards = components.filter(isBoardComponent);
  const available = new Set(boards.map((board) => board.id));
  const recentBoardIds = previous.recentBoardIds.filter((id) => available.has(id));
  const activeBoardId = previous.activeBoardId !== null && available.has(previous.activeBoardId)
    ? previous.activeBoardId : recentBoardIds[0] ?? boards[0]?.id ?? null;
  if (activeBoardId === previous.activeBoardId && recentBoardIds.length === previous.recentBoardIds.length)
    return previous;
  return { ...previous, activeBoardId, recentBoardIds };
}

/** Both explicit selector changes and actual canvas selection events use the same MRU rule. */
export function selectContextBoard(
  previous: BoardContextState,
  id: string | null | undefined,
  components: readonly ElectronicComponent[],
): BoardContextState {
  if (!components.some((component) => component.id === id && isBoardComponent(component))) return previous;
  if (id === null || id === undefined) return previous;
  if (previous.activeBoardId === id && previous.recentBoardIds[0] === id) return previous;
  return { ...previous, activeBoardId: id, recentBoardIds: [id, ...previous.recentBoardIds.filter((item) => item !== id)] };
}

/** A component property change cannot masquerade as a fresh canvas selection. */
export function synchronizeBoardContext(
  previous: BoardContextState,
  projectIdentity: string,
  components: readonly ElectronicComponent[],
  selectedComponentId: string | null | undefined,
): BoardContextState {
  const canvasSelectionId = selectedComponentId ?? null;
  if (previous.projectIdentity !== projectIdentity) {
    // Project/import identity resets context even when canvas selection props still refer to the previous document.
    return { ...initialBoardContext(projectIdentity, components), canvasSelectionId };
  }
  const reconciled = reconcileBoardContext(previous, projectIdentity, components);
  if (canvasSelectionId === reconciled.canvasSelectionId) return reconciled;
  return selectContextBoard({ ...reconciled, canvasSelectionId }, canvasSelectionId, components);
}

/** Product names stay recognizable in both locales; ordinal and ID disambiguate duplicate boards. */
export function boardDisplayLabel(board: ContextBoard, boards: readonly ContextBoard[]): string {
  const ordinal = boards.filter((candidate) => candidate.kind === board.kind).findIndex((candidate) => candidate.id === board.id) + 1;
  return `${board.kind === 'esp8266' ? 'ESP8266' : 'Arduino UNO'} #${Math.max(1, ordinal)} · ${board.id}`;
}
