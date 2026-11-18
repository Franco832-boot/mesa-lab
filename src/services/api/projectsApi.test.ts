import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppStore } from '../../app/store';
import { submitAuthentication } from '../../features/auth/authenticate';
import { sessionEnded } from '../../features/auth/authSlice';
import { createProject } from '../../model/project';
import { cloudDocumentSize, prepareCloudProject, readCloudProject } from '../../features/cloudProjects/document';
import { isJsonObject } from './contracts';
import type { CreateProjectRequest, ProjectResponse } from './contracts';
import { projectsApi } from './projectsApi';
import { tasksApi } from './tasksApi';
import { API_BASE_URL } from './config';

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'alice@example.test', createdAt: '2026-11-17T12:00:00.000Z' };
const otherUserId = '22222222-2222-4222-8222-222222222222';
const remoteId = '33333333-3333-4333-8333-333333333333';
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const response = (request: CreateProjectRequest): ProjectResponse => ({ ...request, id: remoteId, userId: user.id, version: 1, createdAt: user.createdAt, updatedAt: user.createdAt });
let app: ReturnType<typeof createAppStore>;
beforeEach(async () => {
  const values = new Map<string, string>();
  app = createAppStore({ getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } });
  vi.stubGlobal('fetch', vi.fn(async () => json({ accessToken: 'fictional-token', tokenType: 'Bearer', expiresIn: 900, user })));
  await app.store.dispatch(submitAuthentication('login', { email: user.email, password: 'Fictional-password-123' })).unwrap();
});
afterEach(async () => {
  app.projectSync.dispose();
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
      expect(input.url.startsWith(API_BASE_URL + '/')).toBe(true);
      expect(input.body).toBeNull();
      expect(input.headers.has('if-match')).toBe(false);
      expect(input.headers.has('idempotency-key')).toBe(false);
      expect(input.headers.has('content-type')).toBe(false);
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
    await expect(list.unwrap()).rejects.toMatchObject({ error: 'invalid-project-response', data: { httpStatus: 200 } }); list.unsubscribe();
    const task = { id: remoteId, userId: otherUserId, title: 'Foreign task', completed: false, createdAt: user.createdAt };
    vi.stubGlobal('fetch', vi.fn(async () => json([task])));
    const tasks = app.store.dispatch(tasksApi.endpoints.getTasks.initiate());
    await expect(tasks.unwrap()).rejects.toMatchObject({ error: 'invalid-response' }); tasks.unsubscribe();
    expect(JSON.stringify(app.store.getState())).not.toContain('Foreign task');
  });
  it('POSTs exactly the request body and a UUID v4 idempotency header, without a preflight list', async () => {
    const body = prepareCloudProject(createProject('local-id'), 'My cloud project');
    const fetch = vi.fn(async (input: Request) => {
      expect(input.method).toBe('POST');
      expect(input.url).toBe(`${API_BASE_URL}/projects`);
      expect(input.headers.get('idempotency-key')).toBe(remoteId);
      expect(input.headers.has('if-match')).toBe(false);
      expect(await input.json()).toEqual(body);
      return json(response(body), 201);
    });
    vi.stubGlobal('fetch', fetch);
    expect(await app.store.dispatch(projectsApi.endpoints.createProject.initiate({ key: remoteId, body })).unwrap()).toEqual(response(body));
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('PATCH sends the last version in the body to the existing UUID, keeping write headers off GET', async () => {
    const body = prepareCloudProject(createProject('local-id'), 'Updated project');
    vi.stubGlobal('fetch', vi.fn(async (input: Request) => {
      expect(input.url).toBe(`${API_BASE_URL}/projects/${remoteId}`);
      expect(input.method).toBe('PATCH');
      expect(input.headers.get('idempotency-key')).toBe(remoteId);
      expect(await input.json()).toEqual({ ...body, version: 3 });
      return json({ ...response(body), version: 4 });
    }));
    const result = await app.store.dispatch(projectsApi.endpoints.updateProject.initiate({ key: remoteId, id: remoteId, body: { ...body, version: 3 } })).unwrap();
    expect(result.id).toBe(remoteId); expect(result.version).toBe(4);
  });
  it.each([400, 403, 404, 409, 412, 500, 503])('retains HTTP %s instead of replacing it with a generic error', async status => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ statusCode: status, message: 'Fictional error', timestamp: user.createdAt }, status)));
    const query = app.store.dispatch(projectsApi.endpoints.getProjects.initiate());
    await expect(query.unwrap()).rejects.toMatchObject({ status }); query.unsubscribe();
  });
  it.each([{ items: [] }, [{ ...response({ name: 'Existing', data: {} }), version: undefined }],
    [{ ...response({ name: 'Existing', data: {} }), version: 0 }]])('reports contract errors as HTTP 200 validation failures', async data => {
    vi.stubGlobal('fetch', vi.fn(async () => json(data)));
    const query = app.store.dispatch(projectsApi.endpoints.getProjects.initiate());
    await expect(query.unwrap()).rejects.toMatchObject({ error: 'invalid-project-response', data: { httpStatus: 200 } }); query.unsubscribe();
  });
  it('distinguishes a non-JSON server error from a rejected project contract', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Gateway unavailable</html>', { status: 502 })));
    const query = app.store.dispatch(projectsApi.endpoints.getProjects.initiate());
    await expect(query.unwrap()).rejects.toMatchObject({ status: 'PARSING_ERROR', originalStatus: 502 }); query.unsubscribe();
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
    await expect(app.store.dispatch(projectsApi.endpoints.createProject.initiate({ key: remoteId, body: { name: 'Too big', data: { code: exact.code + 'x' } } })).unwrap()).rejects.toMatchObject({ error: 'project-too-large' });
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
