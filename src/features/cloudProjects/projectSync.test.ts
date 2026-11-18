import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppStore } from '../../app/store';
import { decodePersistedProject, PERSIST_KEY } from '../../app/persistence';
import { createEmptyProject, serializeProject, STORAGE_KEY } from '../../model/project';
import { submitAuthentication } from '../auth/authenticate';
import { sessionEnded } from '../auth/authSlice';
import { cloudLinkInstalled, editorCommandApplied, nameChanged, projectReplaced } from '../project/projectSlice';
import type { CreateProjectRequest, ProjectResponse } from '../../services/api/contracts';
import { createComponent } from '../../model/components';
import { projectsApi } from '../../services/api/projectsApi';
import { prepareCloudProject } from './document';
import { projectFingerprint } from './saveMetadata';
import { CLOUD_SAVE_DEBOUNCE_MS } from './projectSync';

const owner = { id: '11111111-1111-4111-8111-111111111111', email: 'fixture@example.test', createdAt: '2026-11-18T10:00:00Z' };
const otherOwner = { ...owner, id: '22222222-2222-4222-8222-222222222222' };
const remoteId = '33333333-3333-4333-8333-333333333333';
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const draft = () => createEmptyProject('Original', 'local-draft');
let app: ReturnType<typeof createAppStore>;
let values: Map<string, string>;
let server: ProjectResponse | null;
let writes: { method: string; key: string | null; body: unknown }[];
let failure: number | 'network' | null;
let loseResponse: boolean;
let release: (() => void) | undefined;
let delayNext: boolean;
let authenticatedOwner: typeof owner;
let concurrency: number;
let maximumConcurrency: number;
let receipts: Map<string, ProjectResponse>;
const applications: ReturnType<typeof createAppStore>[] = [];

async function openStore() {
  const opened = createAppStore({ getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } });
  applications.push(opened);
  await new Promise<void>(resolve => {
    if (opened.persistor.getState().bootstrapped) return resolve();
    const unsubscribe = opened.persistor.subscribe(() => { if (opened.persistor.getState().bootstrapped) { unsubscribe(); resolve(); } });
  });
  return opened;
}
async function login() {
  await app.store.dispatch(submitAuthentication('login', { email: owner.email, password: 'Fictional-test-password-123' })).unwrap();
}
async function linked() {
  const document = draft();
  server = { ...prepareCloudProject(document, document.name), id: remoteId, userId: owner.id,
    version: 7, createdAt: owner.createdAt, updatedAt: owner.createdAt };
  app.store.dispatch(projectReplaced(document));
  app.store.dispatch(cloudLinkInstalled({ documentId: document.id,
    remote: { id: server.id, userId: server.userId, version: server.version },
    savedFingerprint: projectFingerprint(document), pending: null }));
  await app.saveNow();
}
async function tick(ms = CLOUD_SAVE_DEBOUNCE_MS) {
  await vi.advanceTimersByTimeAsync(ms);
}
async function settled(check: () => void) {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { check(); return; } catch { await tick(1); }
  }
  check();
}
beforeEach(async () => {
  values = new Map([[STORAGE_KEY, serializeProject(draft())]]);
  server = null; writes = []; failure = null; loseResponse = false; delayNext = false;
  authenticatedOwner = owner; concurrency = 0; maximumConcurrency = 0; receipts = new Map(); release = undefined;
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    if (request.url.endsWith('/auth/login')) return json({ accessToken: 'fictional-token', tokenType: 'Bearer', expiresIn: 900, user: authenticatedOwner });
    expect(request.headers.get('authorization')).toBe('Bearer fictional-token');
    if (request.method === 'GET') {
      expect(request.headers.has('idempotency-key')).toBe(false);
      expect(request.headers.has('if-match')).toBe(false);
      return json(request.url.endsWith('/projects') ? server ? [server] : [] : server);
    }
    const body: unknown = await request.json();
    const key = request.headers.get('idempotency-key');
    writes.push({ method: request.method, key, body });
    concurrency++; maximumConcurrency = Math.max(maximumConcurrency, concurrency);
    try {
      if (delayNext) { delayNext = false; await new Promise<void>(resolve => { release = resolve; }); }
      if (failure === 'network') throw new TypeError('Fictional network loss');
      if (failure !== null) return json({ statusCode: failure, message: 'Fictional failure' }, failure);
      if (key && receipts.has(key)) return json(receipts.get(key), request.method === 'POST' ? 201 : 200);
      if (typeof body !== 'object' || body === null || !('name' in body) || !('data' in body)) throw new Error('Unexpected write');
      if (request.method === 'PATCH' && (!('version' in body) || body.version !== server?.version)) return json({}, 409);
      const data: CreateProjectRequest = JSON.parse(JSON.stringify({ name: body.name, data: body.data }));
      server = { ...data, id: remoteId, userId: owner.id, version: request.method === 'POST' ? 1 : (server?.version ?? 0) + 1,
        createdAt: owner.createdAt, updatedAt: owner.createdAt };
      if (key) receipts.set(key, server);
      if (loseResponse) { loseResponse = false; throw new TypeError('Committed write, lost response'); }
      return json(server, request.method === 'POST' ? 201 : 200);
    } finally { concurrency--; }
  }));
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  app = await openStore();
});
afterEach(async () => {
  release?.();
  for (const current of applications.splice(0)) {
    current.projectSync.dispose(); current.store.dispatch(sessionEnded(null));
    await current.persistor.flush(); current.persistor.pause();
  }
  vi.useRealTimers(); vi.unstubAllGlobals();
});

describe('the existing Redux project and its single cloud synchronization queue', () => {
  it('autosaves guests and signed-in local drafts only in the browser; manual Save creates once and binds the receipt', async () => {
    app.store.dispatch(nameChanged('Guest draft')); await tick(10000);
    expect(decodePersistedProject(values.get(PERSIST_KEY) ?? '').document.name).toBe('Guest draft');
    expect(writes).toEqual([]);
    await login(); app.store.dispatch(nameChanged('Signed-in local draft')); await tick(10000);
    expect(writes).toEqual([]);
    expect(await app.projectSync.save('Untitled')).toBe('cloud');
    expect(writes.map(write => write.method)).toEqual(['POST']);
    expect(writes[0]?.key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(app.store.getState().project.cloudLinks[0]?.remote).toEqual({ id: remoteId, userId: owner.id, version: 1 });
    expect(await app.projectSync.save('Untitled')).toBe('cloud');
    await tick(10000); expect(writes).toHaveLength(1);
  });
  it('debounces rapid component changes for 2 seconds and sends only the final document; no PATCH without real changes', async () => {
    await login(); await linked(); await tick(5000); expect(writes).toEqual([]);
    app.store.dispatch(editorCommandApplied({ type: 'add', component: createComponent('resistor', { x: 10, y: 10 }, 'test-resistor') }));
    await tick(1000); app.store.dispatch(nameChanged('Second change'));
    await tick(1500); expect(writes).toEqual([]);
    app.store.dispatch(nameChanged('Final change')); await tick(1999); expect(writes).toEqual([]);
    await tick(1); await settled(() => expect(app.store.getState().project.cloudLinks[0]?.remote?.version).toBe(8));
    expect(writes.map(write => write.method)).toEqual(['PATCH']);
    expect(server?.name).toBe('Final change'); expect(server?.data.components).toHaveLength(1);
    app.store.dispatch(nameChanged('Final change')); await tick(5000); expect(writes).toHaveLength(1);
  });
  it('manual Save bypasses debounce and serialization sends edits made during a write with the next version', async () => {
    await login(); await linked(); delayNext = true;
    app.store.dispatch(nameChanged('First')); const first = app.projectSync.save('Untitled');
    await settled(() => expect(writes).toHaveLength(1));
    expect(app.store.getState().project.cloudStatus?.phase).toBe('saving');
    app.store.dispatch(nameChanged('Latest')); await tick(5000);
    const second = app.projectSync.save('Untitled'); expect(writes).toHaveLength(1);
    release?.(); await first; await second;
    expect(maximumConcurrency).toBe(1); expect(server?.name).toBe('Latest');
    expect(writes.map(write => write.body)).toEqual([
      expect.objectContaining({ name: 'First', version: 7 }), expect.objectContaining({ name: 'Latest', version: 8 }),
    ]);
    expect(writes[0]?.key).not.toBe(writes[1]?.key);
  });
  it('automatically follows an in-flight write with the most recent pending revision', async () => {
    await login(); await linked(); delayNext = true;
    app.store.dispatch(nameChanged('First')); await tick(); await settled(() => expect(writes).toHaveLength(1));
    app.store.dispatch(nameChanged('Latest')); release?.();
    await settled(() => expect(app.store.getState().project.cloudLinks[0]?.remote?.version).toBe(8));
    await tick(); await settled(() => expect(server?.name).toBe('Latest'));
    expect(maximumConcurrency).toBe(1); expect(writes).toHaveLength(2);
  });
  it('persists the exact POST before transport and reuses its key/body after lost response, edits, logout and reload', async () => {
    await login(); loseResponse = true;
    expect(await app.projectSync.save('Untitled')).toBe('error');
    const first = writes[0];
    expect(decodePersistedProject(values.get(PERSIST_KEY) ?? '').cloudLinks[0]?.pending?.key).toBe(first?.key);
    app.store.dispatch(nameChanged('Edited after uncertainty')); app.backupNow();
    app.projectSync.dispose(); app.store.dispatch(sessionEnded('signed-out')); app.persistor.pause();
    app = await openStore(); await login(); await tick(10000); expect(writes).toHaveLength(1);
    await app.projectSync.save('Untitled');
    expect(writes[1]).toEqual(first); expect(app.store.getState().project.document.name).toBe('Edited after uncertainty');
    await tick(); await settled(() => expect(server?.name).toBe('Edited after uncertainty'));
    expect(writes.map(write => write.method)).toEqual(['POST', 'POST', 'PATCH']);
  });
  it('replays a committed PATCH after a lost response without causing its own version conflict', async () => {
    await login(); await linked(); loseResponse = true; app.store.dispatch(nameChanged('Changed'));
    await app.projectSync.save('Untitled'); expect(server?.version).toBe(8);
    await app.projectSync.save('Untitled');
    expect(writes[1]).toEqual(writes[0]); expect(server?.version).toBe(8);
    expect(app.store.getState().project.cloudLinks[0]?.remote?.version).toBe(8);
  });
  it.each(['network', 500] as const)('retains pending changes after %s, avoids retry storms and allows a manual retry', async error => {
    await login(); await linked(); failure = error; app.store.dispatch(nameChanged('Offline draft')); await tick();
    await settled(() => expect(app.store.getState().project.cloudStatus?.phase).toBe('error'));
    const first = writes[0]; await tick(30000); expect(writes).toHaveLength(1);
    expect(decodePersistedProject(values.get(PERSIST_KEY) ?? '').document.name).toBe('Offline draft');
    failure = null; expect(await app.projectSync.save('Untitled')).toBe('cloud'); expect(writes[1]).toEqual(first);
  });
  it.each([409, 412])('blocks automatic and manual overwrites after HTTP %s and preserves the local draft', async status => {
    await login(); await linked(); failure = status; app.store.dispatch(nameChanged('Conflicting draft'));
    await tick(); await settled(() => expect(app.store.getState().project.cloudStatus?.phase).toBe('conflict'));
    failure = null; app.store.dispatch(nameChanged('Still my draft')); await tick(30000);
    await app.projectSync.save('Untitled'); expect(writes).toHaveLength(1);
    expect(app.store.getState().project.document.name).toBe('Still my draft'); expect(server?.version).toBe(7);
    expect(app.backupNow()).toBe(true);
  });
  it('cannot create another POST when a linked project is signed out or belongs to another user', async () => {
    await login(); await linked(); app.store.dispatch(sessionEnded('signed-out'));
    app.store.dispatch(nameChanged('Signed out draft')); await tick(5000);
    expect(await app.projectSync.save('Untitled')).toBe('error'); expect(writes).toEqual([]);
    authenticatedOwner = otherOwner; await login(); await tick(5000);
    expect(await app.projectSync.save('Untitled')).toBe('error'); expect(writes).toEqual([]);
    expect(app.store.getState().project.cloudStatus?.error).toEqual({ error: 'project-owner-mismatch' });
  });
  it('a late response after a project switch cannot alter the new document or its status', async () => {
    await login(); await linked(); delayNext = true; app.store.dispatch(nameChanged('Previous project'));
    const operation = app.projectSync.save('Untitled'); await settled(() => expect(writes).toHaveLength(1));
    const replacement = createEmptyProject('Other local project', 'other-document');
    app.store.dispatch(projectReplaced(replacement)); release?.(); await operation;
    expect(app.store.getState().project.document).toEqual(replacement); expect(app.store.getState().project.cloudStatus).toBeNull();
    expect(app.store.getState().project.cloudLinks[0]?.remote?.version).toBe(8);
  });
  it('a late response after logout cannot acknowledge the old account write; its receipt remains retryable', async () => {
    await login(); await linked(); delayNext = true; app.store.dispatch(nameChanged('Private draft'));
    const operation = app.projectSync.save('Untitled'); await settled(() => expect(writes).toHaveLength(1));
    app.store.dispatch(sessionEnded('signed-out')); release?.(); await operation;
    expect(app.store.getState().project.cloudStatus).toBeNull();
    expect(app.store.getState().project.cloudLinks[0]?.pending).not.toBeNull();
    expect(app.store.getState().project.cloudLinks[0]?.remote?.version).toBe(7);
  });
  it('GET restores remote content and version; a reloaded pending local draft survives until its owner signs in', async () => {
    await login(); await linked(); app.store.dispatch(nameChanged('Reload pending draft')); app.backupNow();
    app.projectSync.dispose(); app.store.dispatch(sessionEnded(null)); app.persistor.pause();
    app = await openStore(); expect(app.store.getState().project.document.name).toBe('Reload pending draft');
    await tick(5000); expect(writes).toEqual([]); await login(); await tick();
    await settled(() => expect(server?.name).toBe('Reload pending draft'));
    const query = app.store.dispatch(projectsApi.endpoints.getProject.initiate(remoteId));
    const response = await query.unwrap(); query.unsubscribe();
    expect(response.id).toBe(remoteId); expect(response.version).toBe(8); expect(response.data.name).toBe('Reload pending draft');
  });
});
