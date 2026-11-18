import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { createProject } from '../../model/project';
import type { CircuitProject, Viewport } from '../../model/types';
import { applyEditorCommand, editorSnapshot } from '../../model/editor';
import type { EditorCommand, EditorSnapshot } from '../../model/editor';
import type { CloudProjectLink, CloudSaveStatus, PendingProjectSave, RemoteProjectIdentity } from '../cloudProjects/saveMetadata';
import { sessionEnded } from '../auth/authSlice';

export interface ProjectState {
  document: CircuitProject;
  cloudLinks: CloudProjectLink[];
  cloudStatus: CloudSaveStatus;
  saveStatus: 'saving' | 'saved' | 'error';
  restoreIssue: boolean;
  restored: boolean;
  history: { past: EditorSnapshot[]; future: EditorSnapshot[] };
}
const initialState: ProjectState = {
  document: createProject('initial-project'),
  cloudLinks: [],
  cloudStatus: null,
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
      state.cloudStatus = null;
      state.saveStatus = 'saving';
      state.restoreIssue = false;
      state.history = { past: [], future: [] };
    },
    cloudLinkInstalled(state, action: PayloadAction<CloudProjectLink>) {
      state.cloudLinks = state.cloudLinks.filter(link => link.documentId !== action.payload.documentId);
      state.cloudLinks.push(action.payload);
      state.cloudStatus = null;
      state.saveStatus = 'saving';
    },
    cloudLinkDetached(state, action: PayloadAction<string>) {
      state.cloudLinks = state.cloudLinks.filter(link => link.documentId !== action.payload);
      state.cloudStatus = null;
      state.saveStatus = 'saving';
    },
    cloudSavePrepared(state, action: PayloadAction<{ documentId: string; pending: PendingProjectSave }>) {
      const link = state.cloudLinks.find(item => item.documentId === action.payload.documentId);
      if (link) link.pending = action.payload.pending;
      else state.cloudLinks.push({ documentId: action.payload.documentId, remote: null, savedFingerprint: null, pending: action.payload.pending });
      state.saveStatus = 'saving';
    },
    cloudSaveCommitted(state, action: PayloadAction<{ documentId: string; key: string; remote: RemoteProjectIdentity; fingerprint: string }>) {
      const link = state.cloudLinks.find(item => item.documentId === action.payload.documentId);
      if (!link || link.pending?.key !== action.payload.key) return;
      link.remote = action.payload.remote;
      link.savedFingerprint = action.payload.fingerprint;
      link.pending = null;
      state.saveStatus = 'saving';
      if (state.cloudStatus?.documentId === action.payload.documentId) state.cloudStatus = null;
    },
    cloudStatusChanged(state, action: PayloadAction<CloudSaveStatus>) {
      // A late result can only update its own active document's presentation.
      if (action.payload === null || action.payload.documentId === state.document.id) state.cloudStatus = action.payload;
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
  extraReducers: builder => { builder.addCase(sessionEnded, state => { state.cloudStatus = null; }); },
});
export const {
  nameChanged,
  viewportChanged,
  projectReplaced,
  cloudLinkInstalled,
  cloudLinkDetached,
  cloudSavePrepared,
  cloudSaveCommitted,
  cloudStatusChanged,
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
