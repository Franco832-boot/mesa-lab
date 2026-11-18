import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppStore } from '../../app/store';
import { submitAuthentication } from '../../features/auth/authenticate';
import { sessionEnded } from '../../features/auth/authSlice';
import { createProject } from '../../model/project';
import { canonicalJson, cloudDocumentSize, prepareCloudProject, readCloudProject } from '../../features/cloudProjects/document';
import { isJsonObject } from './contracts';
import type { CreateProjectRequest, ProjectResponse } from './contracts';
import { projectsApi } from './projectsApi';
import { tasksApi } from './tasksApi';

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'alice@example.test', createdAt: '2026-11-17T12:00:00.000Z' };
const otherUserId = '22222222-2222-4222-8222-222222222222';
const remoteId = '33333333-3333-4333-8333-333333333333';
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const response = (request: CreateProjectRequest): ProjectResponse => ({ ...request, id: remoteId, userId: user.id, createdAt: user.createdAt, updatedAt: user.createdAt });
let app: ReturnType<typeof createAppStore>;
beforeEach(async () => {
  const values = new Map<string, string>();
  app = createAppStore({ getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } });
  vi.stubGlobal('fetch', vi.fn(async () => json({ accessToken: 'fictional-token', tokenType: 'Bearer', expiresIn: 900, user })));
  await app.store.dispatch(submitAuthentication('login', { email: user.email, password: 'Fictional-password-123' })).unwrap();
});
afterEach(async () => {
  app.store.dispatch(sessionEnded(null));
  await app.persistor.flush(); app.persistor.pause(); vi.unstubAllGlobals(); vi.useRealTimers();
});
describe('real project and task contracts', () => {
  it('lists arrays, retrieves by remote UUID, queries tasks and sends Bearer without userId bodies', async () => {
    const request = prepareCloudProject(createProject('local-id'), 'Cloud copy');
    const project = response(request);
    const task = { id: remoteId, userId: user.id, title: 'Fictional task', completed: false, createdAt: user.createdAt };
    vi.stubGlobal('fetch', vi.fn(async (input: Request) => {
      expect(input.headers.get('authorization')).toBe('Bearer fictional-token');
      expect(input.method).toBe('GET');
      return json(input.url.endsWith('/tasks') ? [task] : input.url.endsWith(`/projects/${remoteId}`) ? project : [project]);
    }));
    const list = app.store.dispatch(projectsApi.endpoints.getProjects.initiate());
    expect(await list.unwrap()).toEqual([project]);
    const detail = app.store.dispatch(projectsApi.endpoints.getProject.initiate(remoteId));
    expect(await detail.unwrap()).toEqual(project);
    const tasks = app.store.dispatch(tasksApi.endpoints.getTasks.initiate());
    expect(await tasks.unwrap()).toEqual([task]);
    list.unsubscribe(); detail.unsubscribe(); tasks.unsubscribe();
  });
  it('rejects foreign-user data even if a faulty service returns 200', async () => {
    const project = { ...response(prepareCloudProject(createProject(), 'Private')), userId: otherUserId };
    vi.stubGlobal('fetch', vi.fn(async () => json([project])));
    const list = app.store.dispatch(projectsApi.endpoints.getProjects.initiate());
    await expect(list.unwrap()).rejects.toMatchObject({ error: 'invalid-response' }); list.unsubscribe();
    const task = { id: remoteId, userId: otherUserId, title: 'Foreign task', completed: false, createdAt: user.createdAt };
    vi.stubGlobal('fetch', vi.fn(async () => json([task])));
    const tasks = app.store.dispatch(tasksApi.endpoints.getTasks.initiate());
    await expect(tasks.unwrap()).rejects.toMatchObject({ error: 'invalid-response' }); tasks.unsubscribe();
    expect(JSON.stringify(app.store.getState())).not.toContain('Foreign task');
  });
  it('reads before creating and POSTs exactly { name, data } once', async () => {
    const request = prepareCloudProject(createProject('local-id'), '  My cloud copy  ');
    const methods: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: Request) => {
      methods.push(input.method);
      if (input.method === 'GET') return json([]);
      expect(await input.json()).toEqual(request);
      return json(response(request), 201);
    }));
    const before = app.store.getState().project.document;
    expect(await app.store.dispatch(projectsApi.endpoints.createProject.initiate(request)).unwrap()).toEqual(response(request));
    expect(methods).toEqual(['GET', 'POST']);
    expect(app.store.getState().project.document).toBe(before);
  });
  it('does not duplicate an identical JSONB document with reordered object keys', async () => {
    const request: CreateProjectRequest = { name: 'Same copy', data: { a: 1, b: { x: true, y: false } } };
    const existing = response({ name: request.name, data: { b: { y: false, x: true }, a: 1 } });
    const fetch = vi.fn(async () => json([existing])); vi.stubGlobal('fetch', fetch);
    expect(await app.store.dispatch(projectsApi.endpoints.createProject.initiate(request)).unwrap()).toEqual(existing);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(canonicalJson(existing.data)).toBe(canonicalJson(request.data));
  });
  it('prevents overlapping creates across mutation instances', async () => {
    const request = prepareCloudProject(createProject(), 'Concurrent');
    let release: ((response: Response) => void) | undefined;
    let started: (() => void) | undefined;
    const waiting = new Promise<void>(resolve => { started = resolve; });
    vi.stubGlobal('fetch', vi.fn(async (input: Request) => {
      if (input.method === 'GET') { started?.(); return new Promise<Response>(resolve => { release = resolve; }); }
      return json(response(request), 201);
    }));
    const first = app.store.dispatch(projectsApi.endpoints.createProject.initiate(request));
    await waiting;
    await expect(app.store.dispatch(projectsApi.endpoints.createProject.initiate(request)).unwrap()).rejects.toMatchObject({ error: 'create-busy' });
    release?.(json([])); expect(await first.unwrap()).toEqual(response(request));
  });
  it('reconciles a committed write with a lost response, without issuing another POST', async () => {
    const request = prepareCloudProject(createProject(), 'Lost response');
    let stored: ProjectResponse[] = [], writes = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: Request) => {
      if (input.method === 'GET') return json(stored);
      writes++; stored = [response(request)];
      throw new TypeError('Simulated disconnected response');
    }));
    await expect(app.store.dispatch(projectsApi.endpoints.createProject.initiate(request)).unwrap()).rejects.toMatchObject({ error: 'save-uncertain' });
    expect(writes).toBe(1);
    expect(await app.store.dispatch(projectsApi.endpoints.createProject.initiate(request)).unwrap()).toEqual(stored[0]);
    expect(writes).toBe(1);
  });
  it('does not resend an uncertain write if a later read cannot confirm it', async () => {
    const request = prepareCloudProject(createProject(), 'Uncertain');
    let writes = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: Request) => {
      if (input.method === 'GET') return json([]);
      writes++; return json({ statusCode: 500, message: 'Error interno del servidor', timestamp: user.createdAt }, 500);
    }));
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(app.store.dispatch(projectsApi.endpoints.createProject.initiate(request)).unwrap()).rejects.toMatchObject({ error: 'save-uncertain' });
    }
    expect(writes).toBe(1);
  });
  it('does not POST if the preflight read fails, and does not automatically retry', async () => {
    const fetch = vi.fn(async () => { throw new TypeError('Offline'); }); vi.stubGlobal('fetch', fetch);
    await expect(app.store.dispatch(projectsApi.endpoints.createProject.initiate(prepareCloudProject(createProject(), 'Offline'))).unwrap()).rejects.toMatchObject({ status: 'FETCH_ERROR' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('ignores a late private list after switching accounts', async () => {
    const project = response(prepareCloudProject(createProject(), 'Private old project'));
    let release: ((response: Response) => void) | undefined;
    let started: (() => void) | undefined;
    const waiting = new Promise<void>(resolve => { started = resolve; });
    vi.stubGlobal('fetch', vi.fn(async () => { started?.(); return new Promise<Response>(resolve => { release = resolve; }); }));
    const list = app.store.dispatch(projectsApi.endpoints.getProjects.initiate()); await waiting;
    app.store.dispatch(sessionEnded('signed-out'));
    release?.(json([project])); await list;
    expect(JSON.stringify(app.store.getState().api)).not.toContain(project.name);
    expect(app.store.getState().api.queries).toEqual({}); list.unsubscribe();
  });
});
describe('cloud document boundaries', () => {
  it('checks 256 KiB using UTF-8 bytes, including multibyte characters, before any request', async () => {
    // {"code":""} is 11 ASCII bytes. Each ñ is exactly two UTF-8 bytes.
    const exact = { code: 'ñ'.repeat(131066) + 'x' };
    expect(cloudDocumentSize(exact)).toBe(262144);
    const fetch = vi.fn(async () => json([])); vi.stubGlobal('fetch', fetch);
    await expect(app.store.dispatch(projectsApi.endpoints.createProject.initiate({ name: 'Too big', data: { code: exact.code + 'x' } })).unwrap()).rejects.toMatchObject({ error: 'project-too-large' });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('accepts valid simulator data without mutating it and rejects generic backend JSON', () => {
    const project = createProject('portable-id'); const before = JSON.stringify(project);
    const request = prepareCloudProject(project, 'Cloud');
    expect(readCloudProject(response(request))).toEqual(project);
    expect(JSON.stringify(project)).toBe(before);
    expect(() => readCloudProject(response({ name: 'Generic JSONB', data: {} }))).toThrow();
  });
  it('preserves local-only large projects and rejects JSONB-incompatible source text', () => {
    const project = createProject();
    project.programs = [{ componentId: 'uno-reference', source: 'x'.repeat(270000), language: 'arduino-cpp', execution: 'unavailable' }];
    expect(() => prepareCloudProject(project, 'Large')).toThrow('project-too-large');
    expect(project.programs[0]?.source.length).toBe(270000);
    expect(isJsonObject({ source: '\u0000' })).toBe(false);
    expect(isJsonObject({ source: '\uD800' })).toBe(false);
    expect(isJsonObject({ source: '🙂' })).toBe(true);
  });
});
