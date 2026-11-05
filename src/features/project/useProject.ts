import { useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import type { CircuitProject, Viewport } from '../../model/types';
import { createProject, parseProject } from '../../model/project';
import { nameChanged, projectReplaced, viewportChanged } from './projectSlice';

/** Small UI adapter; Redux owns the document, React owns transient presentation. */
export function useProject() {
  const dispatch = useAppDispatch();
  const {
    document: project,
    saveStatus,
    restoreIssue,
    restored,
    history,
  } = useAppSelector((state) => state.project);
  const [revision, setRevision] = useState(0);
  const updateName = (name: string) => dispatch(nameChanged(name));
  const updateViewport = (viewport: Viewport) => dispatch(viewportChanged(viewport));
  const load = (source: string): CircuitProject => {
    const parsed = parseProject(source);
    dispatch(projectReplaced(parsed));
    setRevision((previous) => previous + 1);
    return parsed;
  };
  const reset = () => {
    dispatch(projectReplaced(createProject()));
    setRevision((previous) => previous + 1);
  };
  return {
    project,
    saved: saveStatus === 'saved',
    saveStatus,
    revision,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    initialIssue: restoreIssue ? ('restoreError' as const) : null,
    autoFit: !restored,
    updateName,
    updateViewport,
    load,
    reset,
  };
}
