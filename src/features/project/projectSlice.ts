import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { createProject } from '../../model/project';
import type { CircuitProject, Viewport } from '../../model/types';
import { applyEditorCommand, editorSnapshot } from '../../model/editor';
import type { EditorCommand, EditorSnapshot } from '../../model/editor';

export interface ProjectState {
  document: CircuitProject;
  saveStatus: 'saving' | 'saved' | 'error';
  restoreIssue: boolean;
  restored: boolean;
  history: { past: EditorSnapshot[]; future: EditorSnapshot[] };
}
const initialState: ProjectState = {
  document: createProject('initial-project'),
  saveStatus: 'saving',
  restoreIssue: false,
  restored: false,
  history: { past: [], future: [] },
};
const slice = createSlice({
  name: 'project',
  initialState,
  reducers: {
    nameChanged(state, action: PayloadAction<string>) {
      state.document.name = action.payload.slice(0, 100);
      state.saveStatus = 'saving';
    },
    viewportChanged(state, action: PayloadAction<Viewport>) {
      state.document.viewport = action.payload;
      state.saveStatus = 'saving';
    },
    projectReplaced(state, action: PayloadAction<CircuitProject>) {
      state.document = action.payload;
      state.saveStatus = 'saving';
      state.restoreIssue = false;
      state.history = { past: [], future: [] };
    },
    editorCommandApplied(state, action: PayloadAction<EditorCommand>) {
      const next = applyEditorCommand(state.document, action.payload);
      if (next === state.document) return;
      state.history.past.push(editorSnapshot(state.document));
      if (state.history.past.length > 50) state.history.past.shift();
      state.history.future = [];
      state.document = next;
      state.saveStatus = 'saving';
    },
    undoApplied(state) {
      const previous = state.history.past.pop();
      if (!previous) return;
      state.history.future.push(editorSnapshot(state.document));
      Object.assign(state.document, previous);
      state.saveStatus = 'saving';
    },
    redoApplied(state) {
      const next = state.history.future.pop();
      if (!next) return;
      state.history.past.push(editorSnapshot(state.document));
      Object.assign(state.document, next);
      state.saveStatus = 'saving';
    },
    checkpointRequested(state) {
      state.document = { ...state.document };
      state.saveStatus = 'saving';
    },
    persistenceSucceeded(state) {
      state.saveStatus = 'saved';
    },
    persistenceFailed(state) {
      state.saveStatus = 'error';
    },
    recoveryFailed(state) {
      state.restoreIssue = true;
    },
    projectRestored(state) {
      state.restored = true;
    },
  },
});
export const {
  nameChanged,
  viewportChanged,
  projectReplaced,
  checkpointRequested,
  persistenceSucceeded,
  persistenceFailed,
  recoveryFailed,
  projectRestored,
  editorCommandApplied,
  undoApplied,
  redoApplied,
} = slice.actions;
export const projectReducer = slice.reducer;
