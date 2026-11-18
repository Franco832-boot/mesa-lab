import type { AppStore } from '../../app/store';
import { projectsApi } from '../../services/api/projectsApi';
import { record } from '../../services/api/contracts';
import { parseProject } from '../../model/project';
import { cloudSaveCommitted, cloudSavePrepared, cloudStatusChanged } from '../project/projectSlice';
import { CloudDocumentError, prepareCloudProject } from './document';
import { createSaveKey, projectFingerprint } from './saveMetadata';

export const CLOUD_SAVE_DEBOUNCE_MS = 2000;
export type SaveResult = 'local' | 'cloud' | 'pending' | 'error';
export interface ProjectSync {
  save: (fallbackName: string) => Promise<SaveResult>;
  retryRemote: () => Promise<SaveResult>;
  dispose: () => void;
}

/** One scheduler per existing store. RTK Query owns transport; Redux owns durable receipts.
 * No automatic POST. No overlapping writes. An uncertain request is replayed unchanged.
 */
export function createProjectSync(store: AppStore, saveLocal: () => Promise<boolean>): ProjectSync {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active: Promise<SaveResult> | null = null;
  let disposed = false;
  let observedDocument = store.getState().project.document;
  let observedEpoch = store.getState().auth.epoch;
  let observedUser = store.getState().auth.user;
  const cancelTimer = () => { clearTimeout(timer); timer = undefined; };
  const eligible = () => {
    const { project, auth } = store.getState();
    const link = project.cloudLinks.find(item => item.documentId === project.document.id);
    if (!auth.user || auth.expiresAt === null || auth.expiresAt <= Date.now() || !link) return false;
    const owner = link.remote?.userId ?? link.pending?.userId;
    // An unconfirmed POST remains an explicit operation, even after login/reload.
    if (!link.remote || owner !== auth.user.id) return false;
    if (project.cloudStatus?.phase === 'error' || project.cloudStatus?.phase === 'conflict') return false;
    return link.pending !== null || link.savedFingerprint !== projectFingerprint(project.document);
  };
  const schedule = () => {
    cancelTimer();
    if (disposed || active || !eligible()) return;
    timer = setTimeout(() => { timer = undefined; void run(false, ''); }, CLOUD_SAVE_DEBOUNCE_MS);
  };
  const perform = async (manual: boolean, fallbackName: string): Promise<SaveResult> => {
    const initial = store.getState();
    const document = initial.project.document;
    const documentId = document.id;
    const epoch = initial.auth.epoch;
    const user = initial.auth.user;
    const link = initial.project.cloudLinks.find(item => item.documentId === documentId);
    const sessionCurrent = () => store.getState().auth.epoch === epoch && store.getState().auth.user?.id === user?.id;
    const report = (error: unknown, conflict = false) => {
      if (sessionCurrent()) store.dispatch(cloudStatusChanged({ documentId, phase: conflict ? 'conflict' : 'error', error }));
    };
    // Local persistence always happens, including without a session or after a cloud failure.
    if (!await saveLocal()) { report({ error: 'local-backup-failed' }); return 'error'; }
    if (!user) {
      if (link?.remote || link?.pending) { report({ status: 401, data: null }); return 'error'; }
      return 'local';
    }
    if (!sessionCurrent()) return 'pending';
    if (!manual && !link?.remote) return 'local';
    if ((link?.remote?.userId ?? link?.pending?.userId ?? user.id) !== user.id) {
      report({ error: 'project-owner-mismatch' }); return 'error';
    }
    if (initial.project.cloudStatus?.documentId === documentId && initial.project.cloudStatus.phase === 'conflict') return 'error';
    if (!link?.pending && link?.remote && link.savedFingerprint === projectFingerprint(document)) return 'cloud';
    try {
      const pending = link?.pending ?? {
        key: createSaveKey(), userId: user.id,
        target: link?.remote ? { id: link.remote.id, version: link.remote.version } : null,
        body: prepareCloudProject(document, document.name || fallbackName),
      };
      if (!link?.pending) store.dispatch(cloudSavePrepared({ documentId, pending }));
      // The key and exact body must reach disk before the first network write.
      if (!await saveLocal()) { report({ error: 'local-backup-failed' }); return 'error'; }
      if (!sessionCurrent()) return 'pending';
      store.dispatch(cloudStatusChanged({ documentId, phase: 'saving', error: null }));
      const operation = pending.target
        ? store.dispatch(projectsApi.endpoints.updateProject.initiate({ key: pending.key, id: pending.target.id,
          body: { ...pending.body, version: pending.target.version } }))
        : store.dispatch(projectsApi.endpoints.createProject.initiate({ key: pending.key, body: pending.body }));
      try {
        const response = await operation.unwrap();
        if (!sessionCurrent()) return 'pending';
        // Only this receipt is acknowledged, never edits made while its request was in flight.
        const fingerprint = projectFingerprint(parseProject(JSON.stringify(pending.body.data)));
        store.dispatch(cloudSaveCommitted({ documentId, key: pending.key,
          remote: { id: response.id, userId: response.userId, version: response.version }, fingerprint }));
        if (!await saveLocal()) { report({ error: 'local-backup-failed' }); return 'error'; }
        const current = store.getState().project;
        return current.document.id === documentId && projectFingerprint(current.document) !== fingerprint ? 'pending' : 'cloud';
      } finally { operation.reset(); }
    } catch (failure: unknown) {
      const error = failure instanceof CloudDocumentError ? { error: failure.code }
        : record(failure) ? failure : { error: 'sync-failed' };
      report(error, record(error) && (error.status === 409 || error.status === 412));
      return 'error';
    }
  };
  function run(manual: boolean, fallbackName: string): Promise<SaveResult> {
    cancelTimer();
    if (disposed) return Promise.resolve('error');
    if (active) {
      if (!manual) return active;
      const documentId = store.getState().project.document.id;
      const epoch = store.getState().auth.epoch;
      return active.then(result => {
        if (result === 'error' || disposed || store.getState().project.document.id !== documentId
          || store.getState().auth.epoch !== epoch) return result;
        return run(true, fallbackName);
      });
    }
    active = perform(manual, fallbackName).finally(() => { active = null; schedule(); });
    return active;
  }
  const unsubscribe = store.subscribe(() => {
    const state = store.getState();
    if (state.project.document !== observedDocument || state.auth.epoch !== observedEpoch || state.auth.user !== observedUser) {
      observedDocument = state.project.document;
      observedEpoch = state.auth.epoch;
      observedUser = state.auth.user;
      schedule();
    }
  });
  return {
    save: fallbackName => run(true, fallbackName),
    retryRemote: () => {
      const { project } = store.getState();
      if (!project.cloudLinks.some(link => link.documentId === project.document.id && link.remote)
        || project.cloudStatus?.phase === 'conflict') return Promise.resolve('local');
      store.dispatch(cloudStatusChanged(null));
      return run(false, '');
    },
    dispose: () => { disposed = true; cancelTimer(); unsubscribe(); },
  };
}
