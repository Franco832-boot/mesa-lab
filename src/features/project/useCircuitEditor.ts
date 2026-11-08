import { useCallback, useEffect, useState } from 'react';
import { useAppDispatch } from '../../app/hooks';
import type { CircuitProject, WorkspaceTool } from '../../model/types';
import type { EditorCommand } from '../../model/editor';
import { newId } from '../../model/components';
import { editorCommandApplied, redoApplied, undoApplied } from './projectSlice';

export function useCircuitEditor(project: CircuitProject, onError: () => void, locked = false) {
  const dispatch = useAppDispatch();
  const [selection, setSelection] = useState<{ components: string[]; wire: string | null }>({
    components: [],
    wire: null,
  });
  const [tool, setTool] = useState<WorkspaceTool>('select');
  const [cancelEpoch, setCancelEpoch] = useState(0);
  const execute = useCallback(
    (command: EditorCommand): boolean => {
      if (locked && command.type !== 'program' && command.type !== 'program-file' && command.type !== 'network') return false;
      try {
        dispatch(editorCommandApplied(command));
        return true;
      } catch {
        onError();
        return false;
      }
    },
    [dispatch, onError, locked],
  );
  const clearSelection = useCallback(() => setSelection({ components: [], wire: null }), []);
  const selectComponent = useCallback((id: string, additive = false) => {
    setSelection((previous) => ({
      wire: null,
      components: additive
        ? previous.components.includes(id)
          ? previous.components.filter((item) => item !== id)
          : [...previous.components, id]
        : previous.components.includes(id)
          ? previous.components
          : [id],
    }));
  }, []);
  const selectWire = useCallback((id: string) => setSelection({ components: [], wire: id }), []);
  const remove = useCallback(() => {
    if (locked) return;
    execute({
      type: 'delete',
      componentIds: selection.components,
      wireIds: selection.wire ? [selection.wire] : [],
    });
    clearSelection();
  }, [execute, selection, clearSelection, locked]);
  const rotate = useCallback(() => {
    if (locked) return;
    execute({ type: 'rotate', ids: selection.components });
  }, [execute, selection.components, locked]);
  const duplicate = useCallback(() => {
    if (locked) return;
    const components = selection.components
      .filter((id) => project.components.some((item) => item.id === id))
      .map((originalId) => ({ originalId, newId: newId() }));
    if (!components.length) return;
    const wires = project.wires
      .filter(
        (item) =>
          selection.components.includes(item.from.componentId) &&
          selection.components.includes(item.to.componentId),
      )
      .map((item) => ({ originalId: item.id, newId: newId() }));
    if (execute({ type: 'duplicate', components, wires }))
      setSelection({ components: components.map((item) => item.newId), wire: null });
  }, [execute, project.components, project.wires, selection.components, locked]);
  const undo = useCallback(() => {
    if (locked) return;
    dispatch(undoApplied());
    setCancelEpoch((value) => value + 1);
  }, [dispatch, locked]);
  const redo = useCallback(() => {
    if (locked) return;
    dispatch(redoApplied());
    setCancelEpoch((value) => value + 1);
  }, [dispatch, locked]);
  useEffect(() => {
    setSelection((previous) => {
      const components = previous.components.filter((id) =>
        project.components.some((item) => item.id === id),
      );
      const wire = project.wires.some((item) => item.id === previous.wire) ? previous.wire : null;
      return components.length === previous.components.length && wire === previous.wire
        ? previous
        : { components, wire };
    });
  }, [project.components, project.wires]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest('input,textarea,select,[contenteditable="true"],[data-component-control],[data-workspace-tool]')
      )
        return;
      if (document.querySelector('dialog[open]')) return;
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (modifier && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (modifier && key === 'y') {
        event.preventDefault();
        redo();
      } else if (modifier && key === 'd') {
        event.preventDefault();
        duplicate();
      } else if (modifier && key === 'a') {
        event.preventDefault();
        setSelection({ components: project.components.map((item) => item.id), wire: null });
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        remove();
      } else if (event.key === 'Escape') {
        setCancelEpoch((value) => value + 1);
        clearSelection();
      } else if (key === 'r') {
        event.preventDefault();
        rotate();
      } else if (key === 'v') setTool('select');
      else if (key === 'h') setTool('pan');
      else if (key === 'c' && !locked) setTool('connect');
    };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [clearSelection, duplicate, project.components, redo, remove, rotate, undo, locked]);
  return {
    selection,
    tool,
    setTool,
    cancelEpoch,
    execute,
    clearSelection,
    selectComponent,
    selectWire,
    remove,
    rotate,
    duplicate,
    undo,
    redo,
  };
}
