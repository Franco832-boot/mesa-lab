import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppStore } from '../../app/store';
import { PERSIST_KEY } from '../../app/persistence';
import { submitAuthentication } from '../../features/auth/authenticate';
import { sessionEnded } from '../../features/auth/authSlice';
import { nameChanged } from '../../features/project/projectSlice';
import { authApi } from './authApi';
import { baseApi } from './baseApi';
import { API_BASE_URL } from './config';

const alice = { id: '11111111-1111-4111-8111-111111111111', email: 'alice@example.test', createdAt: '2026-11-17T12:00:00.000Z' };
const bob = { ...alice, id: '22222222-2222-4222-8222-222222222222', email: 'bob@example.test' };
const password = 'Fictional-test-password-123';
const token = 'fictional-access-token';
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
let app: ReturnType<typeof createAppStore>;
let values: Map<string, string>;
beforeEach(async () => {
  values = new Map();
  app = createAppStore({ getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } });
  await new Promise<void>(resolve => {
    if (app.persistor.getState().bootstrapped) return resolve();
    const unsubscribe = app.persistor.subscribe(() => { if (app.persistor.getState().bootstrapped) { unsubscribe(); resolve(); } });
  });
});
afterEach(async () => {
  app.store.dispatch(sessionEnded(null));
  await app.persistor.flush(); app.persistor.pause();
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});
describe('authentication transport and session isolation', () => {
  it.each(['login', 'register'] as const)('%s uses the real body and caches neither the password nor token', async mode => {
    const fetch = vi.fn(async (request: Request) => {
      expect(request.url).toBe(`${API_BASE_URL}/auth/${mode}`);
      expect(request.method).toBe('POST');
      expect(request.credentials).toBe('omit');
      expect(request.headers.has('authorization')).toBe(false);
      expect(await request.json()).toEqual({ email: alice.email, password });
      return json({ accessToken: token, tokenType: 'Bearer', expiresIn: 900, user: alice }, mode === 'register' ? 201 : 200);
    });
    vi.stubGlobal('fetch', fetch);
    const operation = app.store.dispatch(submitAuthentication(mode, { email: alice.email, password }));
    expect(await operation.unwrap()).toEqual(alice);
    const state = JSON.stringify(app.store.getState());
    expect(state).not.toContain(password); expect(state).not.toContain(token);
    expect(app.store.getState().auth.user).toEqual(alice);
    await app.saveNow();
    const persisted = values.get(PERSIST_KEY) ?? '';
    expect(Object.keys(JSON.parse(persisted))).toEqual(['document', '_persist']);
    expect(persisted).not.toContain(alice.email); expect(persisted).not.toContain(token);
    operation.reset();
  });
  it('queries /auth/me with Bearer, clears private data on logout, and preserves the local document', async () => {
    const fetch = vi.fn(async (request: Request) => {
      if (request.url.endsWith('/auth/login')) return json({ accessToken: token, tokenType: 'Bearer', expiresIn: 900, user: alice });
      expect(request.url).toBe(`${API_BASE_URL}/auth/me`);
      expect(request.headers.get('authorization')).toBe(`Bearer ${token}`);
      return json(alice);
    });
    vi.stubGlobal('fetch', fetch);
    await app.store.dispatch(submitAuthentication('login', { email: alice.email, password })).unwrap();
    const query = app.store.dispatch(authApi.endpoints.me.initiate());
    expect(await query.unwrap()).toEqual(alice);
    app.store.dispatch(nameChanged('Preserved local work'));
    const document = app.store.getState().project.document;
    app.store.dispatch(sessionEnded('signed-out'));
    expect(app.store.getState().project.document).toBe(document);
    expect(app.store.getState().auth.user).toBeNull();
    expect(app.store.getState().api.queries).toEqual({});
    expect(app.store.getState().api.mutations).toEqual({});
    query.unsubscribe();
  });
  it('does not send protected requests without a token', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const query = app.store.dispatch(authApi.endpoints.me.initiate());
    await expect(query.unwrap()).rejects.toMatchObject({ status: 401 });
    expect(fetch).not.toHaveBeenCalled(); query.unsubscribe();
  });
  it('expires the session without removing projects or persisting the session', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ accessToken: token, tokenType: 'Bearer', expiresIn: 1, user: alice })));
    await app.store.dispatch(submitAuthentication('login', { email: alice.email, password })).unwrap();
    const document = app.store.getState().project.document;
    const expiredTime = Date.now() + 2000;
    vi.spyOn(Date, 'now').mockReturnValue(expiredTime);
    const query = app.store.dispatch(authApi.endpoints.me.initiate());
    expect((await query).isSuccess).toBe(false);
    expect(app.store.getState().auth.reason).toBe('expired');
    expect(app.store.getState().project.document).toBe(document);
    query.unsubscribe();
  });
  it('a protected 401 ends the session; a login 401 does not claim successful authentication', async () => {
    vi.stubGlobal('fetch', vi.fn(async (request: Request) => request.method === 'POST'
      ? json({ accessToken: token, tokenType: 'Bearer', expiresIn: 900, user: alice })
      : json({ statusCode: 401, message: 'Token inválido o vencido', timestamp: alice.createdAt }, 401)));
    await app.store.dispatch(submitAuthentication('login', { email: alice.email, password })).unwrap();
    const query = app.store.dispatch(authApi.endpoints.me.initiate());
    expect((await query).isSuccess).toBe(false);
    expect(app.store.getState().auth.user).toBeNull();
    expect(app.store.getState().api.queries).toEqual({}); query.unsubscribe();
    vi.stubGlobal('fetch', vi.fn(async () => json({ statusCode: 401, message: 'Email o contraseña incorrectos', timestamp: alice.createdAt }, 401)));
    await expect(app.store.dispatch(submitAuthentication('login', { email: alice.email, password })).unwrap()).rejects.toMatchObject({ status: 401 });
    expect(app.store.getState().auth.user).toBeNull();
  });
  it('clears the session on its expiration timer without a further network request', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const fetch = vi.fn(async () => json({ accessToken: token, tokenType: 'Bearer', expiresIn: 2, user: alice }));
    vi.stubGlobal('fetch', fetch);
    await app.store.dispatch(submitAuthentication('login', { email: alice.email, password })).unwrap();
    await vi.advanceTimersByTimeAsync(2000);
    expect(app.store.getState().auth.user).toBeNull();
    expect(app.store.getState().auth.reason).toBe('expired');
    expect(app.store.getState().api.mutations).toEqual({});
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('copies only public profile fields into state and query results', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ accessToken: token, tokenType: 'Bearer', expiresIn: 900,
      user: { ...alice, passwordHash: 'fictional-unexpected-field' } })));
    expect(await app.store.dispatch(submitAuthentication('login', { email: alice.email, password })).unwrap()).toEqual(alice);
    expect(JSON.stringify(app.store.getState())).not.toContain('fictional-unexpected-field');
  });
  it('ignores an old login response after logout and a different user login', async () => {
    let finish: ((response: Response) => void) | undefined;
    let started: (() => void) | undefined;
    const waiting = new Promise<void>(resolve => { started = resolve; });
    vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
      const body: unknown = await request.json();
      if (typeof body === 'object' && body !== null && 'email' in body && body.email === alice.email) {
        started?.(); return new Promise<Response>(resolve => { finish = resolve; });
      }
      return json({ accessToken: 'fictional-bob-token', tokenType: 'Bearer', expiresIn: 900, user: bob });
    }));
    const old = app.store.dispatch(submitAuthentication('login', { email: alice.email, password }));
    await waiting;
    app.store.dispatch(sessionEnded('signed-out'));
    await app.store.dispatch(submitAuthentication('login', { email: bob.email, password })).unwrap();
    finish?.(json({ accessToken: token, tokenType: 'Bearer', expiresIn: 900, user: alice }));
    await expect(old.unwrap()).rejects.toBeDefined();
    expect(app.store.getState().auth.user).toEqual(bob);
    expect(JSON.stringify(app.store.getState().api)).not.toContain(alice.email);
  });
  it('aborting login cannot establish a session and rejects malformed contracts', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ access_token: token, user: alice })));
    await expect(app.store.dispatch(submitAuthentication('login', { email: alice.email, password })).unwrap()).rejects.toMatchObject({ error: 'invalid-response' });
    expect(app.store.getState().auth.user).toBeNull();
    app.store.dispatch(baseApi.util.resetApiState());
  });
});
