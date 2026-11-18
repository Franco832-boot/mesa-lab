// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Application } from './Application';
import { createAppStore } from './store';
import { createEmptyProject, createProject, serializeProject, STORAGE_KEY } from '../model/project';
import { EXAMPLE_BACKUP_PREFIX } from '../features/examples/replacement';
import { sessionEnded } from '../features/auth/authSlice';
import { nameChanged } from '../features/project/projectSlice';
import type { ProjectResponse } from '../services/api/contracts';
import { isProject } from '../services/api/contracts';

// These are unit tests with in-memory fetch responses. They open no HTTP server or browser.
const user = { id: '11111111-1111-4111-8111-111111111111', email: 'fixture@example.test', createdAt: '2026-11-17T12:00:00.000Z' };
const password = 'Fictional-unit-password-123';
const token = 'fictional-unit-token';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
let root: Root | undefined;
let app: ReturnType<typeof createAppStore> | undefined;
let container: HTMLDivElement;
let projects: ProjectResponse[];
let writes: number;
let requests: string[];
beforeEach(() => {
  localStorage.clear(); localStorage.setItem('mesa.locale', 'en');
  localStorage.setItem(STORAGE_KEY, serializeProject(createEmptyProject('Existing local project', 'local-project-id')));
  window.history.replaceState(null, '', '/');
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', (media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} }));
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } },
    close: { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; } },
  });
  container = document.createElement('div'); document.body.append(container);
  projects = []; writes = 0; requests = [];
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const path = new URL(request.url).pathname;
    requests.push(`${request.method} ${path}`);
    if (path === '/auth/login' || path === '/auth/register') {
      expect(await request.json()).toEqual({ email: user.email, password });
      expect(request.headers.has('authorization')).toBe(false);
      return json({ accessToken: token, tokenType: 'Bearer', expiresIn: 900, user }, path.endsWith('register') ? 201 : 200);
    }
    expect(request.headers.get('authorization')).toBe(`Bearer ${token}`);
    if (path === '/auth/me') return json(user);
    if (path === '/tasks') throw new Error('The project interface must not request tasks');
    if (path === '/projects' && request.method === 'GET') return json(projects);
    if (path === '/projects' && request.method === 'POST') {
      const body: unknown = await request.json();
      if (typeof body !== 'object' || body === null || !('name' in body) || !('data' in body)) throw new Error('Unexpected request contract');
      writes++;
      const project = { ...body, id: '33333333-3333-4333-8333-333333333333', userId: user.id, createdAt: user.createdAt, updatedAt: user.createdAt };
      if (!isProject(project)) throw new Error('Invalid fixture contract');
      projects.push(project);
      return json(project, 201);
    }
    const found = projects.find(project => path === `/projects/${project.id}`);
    if (found) return json(found);
    throw new Error(`Unexpected API operation: ${request.method} ${path}`);
  }));
});
afterEach(async () => {
  await act(async () => root?.unmount());
  app?.store.dispatch(sessionEnded(null));
  app?.persistor.pause(); await app?.persistor.flush();
  container.remove(); root = undefined; app = undefined;
  vi.restoreAllMocks(); vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});
async function mount() {
  const current = createAppStore(localStorage); app = current;
  await new Promise<void>(resolve => {
    if (current.persistor.getState().bootstrapped) return resolve();
    const unsubscribe = current.persistor.subscribe(() => { if (current.persistor.getState().bootstrapped) { unsubscribe(); resolve(); } });
  });
  root = createRoot(container);
  await act(async () => root?.render(createElement(Application, { application: current })));
  return current;
}
function element(selector: string): HTMLElement {
  const result = container.querySelector(selector);
  if (!(result instanceof HTMLElement)) throw new Error(`Missing ${selector}`);
  return result;
}
function button(text: string, scope: ParentNode = container): HTMLButtonElement {
  const result = [...scope.querySelectorAll('button')].find(item => item.textContent?.trim() === text);
  if (!result) throw new Error(`Missing button ${text}`);
  return result;
}
async function click(target: HTMLElement) { await act(async () => { target.click(); }); }
async function fill(selector: string, value: string) {
  const input = element(selector);
  if (!(input instanceof HTMLInputElement)) throw new Error('Expected input');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function submit() {
  await act(async () => { element('dialog form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
}
async function settled(check: () => void) {
  let failure: unknown;
  for (let attempt = 0; attempt < 100; attempt++) {
    await act(async () => { await new Promise<void>(resolve => setTimeout(resolve, 10)); });
    try { check(); return; } catch (error: unknown) { failure = error; }
  }
  throw failure;
}
async function authenticate(mode = 'Sign in') {
  await click(element('.account-trigger'));
  await click(button(mode, element('[role=menu]')));
  await fill('input[name=email]', user.email); await fill('input[name=password]', password);
  await submit();
  await settled(() => { expect(app?.store.getState().auth.user).toEqual(user); });
}
const remote = (data: ProjectResponse['data']): ProjectResponse => ({ id: '33333333-3333-4333-8333-333333333333', userId: user.id,
  name: 'Remote private copy', data, createdAt: user.createdAt, updatedAt: user.createdAt });

describe('account and cloud UI with the existing application store', () => {
  it.each([{ locale: 'en', register: 'Sign up', login: 'Sign in', logout: 'Sign out' },
    { locale: 'es', register: 'Registrarme', login: 'Ingresar', logout: 'Cerrar sesión' }])('registers and signs out without modifying local data in $locale', async labels => {
    localStorage.setItem('mesa.locale', labels.locale);
    const legacy = localStorage.getItem(STORAGE_KEY);
    const current = await mount(); const document = current.store.getState().project.document;
    expect(button(labels.login)).toBeDefined();
    await click(element('.account-trigger'));
    expect(button(labels.register, element('[role=menu]'))).toBeDefined();
    await click(element('.account-trigger'));
    expect(requests).toEqual([]);
    await authenticate(labels.register);
    expect(container.querySelector('[role=menu]')).toBeNull();
    await click(element('.account-trigger'));
    expect(element('[role=menu]').textContent).toContain(user.email);
    expect(requests).toContain('POST /auth/register'); expect(requests).toContain('GET /auth/me');
    await click(button(labels.logout, element('[role=menu]')));
    expect(current.store.getState().auth.user).toBeNull();
    expect(current.store.getState().api.queries).toEqual({});
    expect(current.store.getState().project.document).toBe(document);
    await act(async () => { await current.saveNow(); });
    expect(localStorage.getItem(STORAGE_KEY)).toBe(legacy);
    const stored = JSON.stringify({ ...localStorage });
    expect(stored).not.toContain(password); expect(stored).not.toContain(token); expect(stored).not.toContain(user.email);
  });
  it('shows credential errors without establishing a session or changing the local project', async () => {
    const current = await mount(); const document = current.store.getState().project.document;
    vi.stubGlobal('fetch', vi.fn(async () => json({ statusCode: 401, message: 'Email o contraseña incorrectos', timestamp: user.createdAt }, 401)));
    await click(element('.account-trigger')); await click(button('Sign in', element('[role=menu]'))); await fill('input[name=email]', user.email); await fill('input[name=password]', password); await submit();
    await settled(() => { expect(element('dialog [role=alert]').textContent).toBe('Incorrect email or password.'); });
    expect(current.store.getState().auth.user).toBeNull(); expect(current.store.getState().project.document).toBe(document);
    expect(element('input[name=password]')).toHaveProperty('value', '');
  });
  it.each([false, true])('keeps one visible Save action and saves only locally (signed in: %s)', async signedIn => {
    const current = await mount();
    if (signedIn) await authenticate();
    await act(async () => { current.store.dispatch(nameChanged('Local draft')); });
    const header = element('.app-header');
    expect(header.querySelectorAll('.save-button')).toHaveLength(1);
    expect(header.textContent).not.toContain('Save a cloud copy');
    expect(container.textContent).not.toContain('My tasks');
    await click(button('Save'));
    await settled(() => { expect(element('#project-save-status').textContent).toContain('Saved locally'); });
    expect(localStorage.getItem('persist:mesa.project')).toContain('Local draft');
    expect(writes).toBe(0);
    expect(requests).not.toContain('GET /tasks');
    expect(requests.some(request => /^(POST|PATCH) \/projects/.test(request))).toBe(false);
    expect(current.store.getState().project.document.name).toBe('Local draft');
  });
  it('opens only after confirmation and preserves an immutable local backup', async () => {
    // A literal portable document is independent of the project parser and API implementation.
    projects = [remote({ format: 'mesa-circuit', version: 1, id: 'downloaded-id', name: 'Downloaded local copy',
      components: [], wires: [], programs: [], viewport: { zoom: 1, offset: { x: 0, y: 0 } } })];
    const current = await mount(); await authenticate();
    await click(button('Open project'));
    expect(current.store.getState().project.document.name).toBe('Existing local project');
    await settled(() => { expect(button('Open project', element('dialog'))).toHaveProperty('disabled', false); });
    await click(button('Open project', element('dialog')));
    expect(current.store.getState().project.document.name).toBe('Downloaded local copy');
    const backups = Object.keys(localStorage).filter(key => key.startsWith(EXAMPLE_BACKUP_PREFIX));
    expect(backups).toHaveLength(1);
    expect(localStorage.getItem(backups[0] ?? '')).toContain('Existing local project');
    await click(element('.account-trigger'));
    await click(button('Sign out', element('[role=menu]')));
    expect(element('[data-testid=cloud-projects]').textContent).not.toContain('Remote private copy');
    expect(current.store.getState().project.document.name).toBe('Downloaded local copy');
  });
  it.each(['invalid', 'backup-quota'] as const)('preserves the local document if remote opening fails: %s', async failure => {
    projects = [remote(failure === 'invalid' ? {} : { format: 'mesa-circuit', version: 1, id: 'downloaded-id', name: 'Downloaded',
      components: [], wires: [], programs: [], viewport: { zoom: 1, offset: { x: 0, y: 0 } } })];
    const current = await mount(); await authenticate();
    const document = current.store.getState().project.document;
    if (failure === 'backup-quota') {
      const set = Storage.prototype.setItem;
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
        if (key.startsWith(EXAMPLE_BACKUP_PREFIX)) throw new Error('Fictional quota failure');
        set.call(this, key, value);
      });
    }
    await click(button('Open project'));
    await settled(() => { expect(button('Open project', element('dialog'))).toHaveProperty('disabled', false); });
    await click(button('Open project', element('dialog')));
    expect(element('dialog [role=alert]')).toBeDefined();
    expect(current.store.getState().project.document).toBe(document);
    expect(Object.keys(localStorage).filter(key => key.startsWith(EXAMPLE_BACKUP_PREFIX))).toEqual([]);
  });
  it('keeps large projects fully usable through the local Save action', async () => {
    const project = createProject('large-local');
    project.programs = [{ componentId: 'uno-reference', language: 'arduino-cpp', execution: 'unavailable', source: '//' + 'x'.repeat(270000) }];
    localStorage.setItem(STORAGE_KEY, serializeProject(project));
    const current = await mount(); await authenticate();
    await click(button('Save'));
    await settled(() => { expect(element('#project-save-status').textContent).toContain('Saved locally'); });
    expect(writes).toBe(0);
    expect(current.store.getState().project.document.programs[0]?.source.length).toBe(270002);
    expect(localStorage.getItem('persist:mesa.project')).toContain('x'.repeat(270000));
  });
  it('supports menu keyboard navigation, Escape focus restoration, and outside dismissal', async () => {
    await mount();
    const trigger = element('.account-trigger');
    await click(trigger);
    const login = button('Sign in', element('[role=menu]'));
    const register = button('Sign up', element('[role=menu]'));
    expect(document.activeElement).toBe(login);
    await act(async () => { login.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); });
    expect(document.activeElement).toBe(register);
    await act(async () => { register.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })); });
    expect(document.activeElement).toBe(login);
    await act(async () => { login.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
    await click(trigger);
    await act(async () => { document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })); });
    expect(container.querySelector('[role=menu]')).toBeNull();
  });
  it.each(['en', 'es'])('shows project cards and modification dates in %s without requesting tasks', async locale => {
    localStorage.setItem('mesa.locale', locale);
    projects = [remote({})];
    await mount(); await authenticate(locale === 'en' ? 'Sign in' : 'Ingresar');
    await settled(() => { expect(container.querySelectorAll('.cloud-project-card')).toHaveLength(1); });
    expect(element('.cloud-project-card strong').textContent).toBe('Remote private copy');
    expect(element('.cloud-project-date time').getAttribute('datetime')).toBe(user.createdAt);
    expect(element('.cloud-open-button').textContent).toContain(locale === 'en' ? 'Open project' : 'Abrir proyecto');
    expect(requests).not.toContain('GET /tasks');
  });
  it('shows a recoverable cloud error while preserving the document and local Save', async () => {
    const current = await mount();
    await authenticate();
    const before = serializeProject(current.store.getState().project.document);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Offline'); }));
    await click(button('Refresh'));
    await settled(() => { expect(element('.cloud-feedback[role=alert]').textContent).toContain('Could not connect'); });
    await click(button('Save'));
    expect(serializeProject(current.store.getState().project.document)).toBe(before);
    expect(writes).toBe(0);
  });
  it('does not accept a cancelled form response after it has been closed', async () => {
    const current = await mount();
    let finish: ((response: Response) => void) | undefined;
    vi.stubGlobal('fetch', vi.fn(async () => new Promise<Response>(resolve => { finish = resolve; })));
    await click(element('.account-trigger')); await click(button('Sign in', element('[role=menu]'))); await fill('input[name=email]', user.email); await fill('input[name=password]', password); await submit();
    await click(button('Cancel', element('dialog')));
    await act(async () => { finish?.(json({ accessToken: token, tokenType: 'Bearer', expiresIn: 900, user })); });
    expect(current.store.getState().auth.user).toBeNull();
    expect(current.store.getState().api.mutations).toEqual({});
    expect(button('Sign in')).toBeDefined();
    // The existing editor still responds after cancellation.
    await act(async () => { current.store.dispatch(nameChanged('Still local')); });
    expect(current.store.getState().project.document.name).toBe('Still local');
  });
});
