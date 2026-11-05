import { configureStore } from '@reduxjs/toolkit';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';
import { createComponent } from '../../model/components';
import { createProject } from '../../model/project';
import { useCircuitEditor } from './useCircuitEditor';
import {
  editorCommandApplied,
  projectReducer,
  projectReplaced,
  undoApplied,
} from './projectSlice';

function editorFixture(locked: boolean) {
  const store = configureStore({ reducer: { project: projectReducer } });
  store.dispatch(projectReplaced({
    ...createProject('editor-lock'),
    components: [createComponent('resistor', { x: 100, y: 100 }, 'selected')],
  }));
  store.dispatch(editorCommandApplied({
    type: 'add',
    component: createComponent('led', { x: 200, y: 200 }, 'other'),
  }));
  store.dispatch(editorCommandApplied({ type: 'rotate', ids: ['selected'] }));
  store.dispatch(undoApplied());
  const onError = vi.fn();
  const holder: { current?: ReturnType<typeof useCircuitEditor> } = {};
  function CaptureEditor() {
    const editor = useCircuitEditor(store.getState().project.document, onError, locked);
    // A render-phase update gives the server harness a real selected component.
    // Effects and browser globals are intentionally not executed by SSR.
    if (!editor.selection.components.includes('selected')) editor.selectComponent('selected');
    holder.current = editor;
    return null;
  }
  renderToStaticMarkup(createElement(Provider, {
    store,
    children: createElement(CaptureEditor),
  }));
  const editor = holder.current;
  if (!editor) throw new Error('Editor harness did not render');
  expect(editor.selection.components).toEqual(['selected']);
  return { store, editor, onError };
}

describe('simulation structural editing lock', () => {
  it('blocks commands, history and selected-component mutations while simulation is locked', () => {
    const { store, editor, onError } = editorFixture(true);
    const before = store.getState().project;
    expect(before.history.past.length).toBeGreaterThan(0);
    expect(before.history.future.length).toBeGreaterThan(0);
    expect(editor.execute({
      type: 'move', positions: { selected: { x: 900, y: 900 } },
    })).toBe(false);
    editor.undo();
    editor.redo();
    editor.rotate();
    editor.duplicate();
    editor.remove();
    expect(store.getState().project).toBe(before);
    expect(store.getState().project.document).toEqual(before.document);
    expect(store.getState().project.history).toEqual(before.history);
    expect(onError).not.toHaveBeenCalled();
  });

  it('allows the same editing entry points again when stopped and unlocked', () => {
    const { store, editor, onError } = editorFixture(false);
    const selected = () => store.getState().project.document.components.find(
      (component) => component.id === 'selected',
    );
    expect(editor.execute({
      type: 'move', positions: { selected: { x: 900, y: 900 } },
    })).toBe(true);
    expect(selected()?.position).toEqual({ x: 900, y: 900 });
    editor.rotate();
    expect(selected()?.rotation).toBe(90);
    editor.duplicate();
    expect(store.getState().project.document.components).toHaveLength(3);
    editor.remove();
    expect(selected()).toBeUndefined();
    editor.undo();
    expect(selected()).toBeDefined();
    editor.redo();
    expect(selected()).toBeUndefined();
    expect(onError).not.toHaveBeenCalled();
  });
});
