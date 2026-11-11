import { useEffect, useRef, useState } from 'react';
import { createExampleProject, projectExamples } from '../model/exampleProjects';
import { createEmptyProject } from '../model/project';
import type { CircuitProject } from '../model/types';
import type { TranslationKey } from '../locales/es/messages';
import { findLocalProject, localProjectPath, parseProjectRoute } from './projectRoutes';
import type { ProjectRoute } from './projectRoutes';

type OpenRoute = Exclude<ProjectRoute, { kind: 'home' | 'missing' }>;
interface Options {
  project: CircuitProject;
  saved: boolean;
  t: (key: TranslationKey) => string;
  install: (next: CircuitProject, route: OpenRoute) => void;
  onHome: () => void;
}
interface Destination { path: string; state: unknown; replace: boolean }
function boundProject(state: unknown): string | null {
  return typeof state === 'object' && state !== null && 'mesaProjectId' in state
    && typeof state.mesaProjectId === 'string' ? state.mesaProjectId : null;
}

/** Runs only after PersistGate rehydration. Route state holds IDs, never document data. */
export function useProjectRoutes(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const initialized = useRef(false);
  const current = useRef({ path: window.location.pathname, state: window.history.state as unknown });
  const [error, setError] = useState<TranslationKey | null>(null);
  const [pending, setPending] = useState<Destination | null>(null);
  const commit = (destination: Destination, path: string, projectId: string) => {
    const state = { mesaProjectId: projectId };
    if (destination.replace) window.history.replaceState(state, '', path);
    else window.history.pushState(state, '', path);
    current.current = { path, state };
  };
  const open = (destination: Destination, initial = false, confirmed = false) => {
    const { project, saved, t, install, onHome } = latest.current;
    const route = parseProjectRoute(destination.path);
    setError(null);
    if (route.kind === 'home' || route.kind === 'missing') {
      commit(destination, destination.path, project.id);
      if (route.kind === 'missing') setError('routeNotFound');
      if (!initial || route.kind === 'missing') onHome();
      return;
    }
    if (boundProject(destination.state) === project.id || (route.kind === 'local' && route.token === project.id)) {
      commit(destination, destination.path, project.id);
      return;
    }
    if (!initial && !confirmed && !saved) { setPending(destination); return; }
    try {
      const previousId = boundProject(destination.state);
      const previous = previousId ? findLocalProject(localStorage, previousId, project) : null;
      const definition = route.kind === 'example' ? projectExamples.find((item) => item.id === route.id) : undefined;
      const next = previous ?? (route.kind === 'new' ? createEmptyProject(t('untitledProject'))
        : route.kind === 'example' && definition ? createExampleProject(route.id, t(definition.name))
          : route.kind === 'local' ? findLocalProject(localStorage, route.token, project) : null);
      if (!next) {
        commit(destination, destination.path, project.id);
        setError('localRouteUnavailable'); onHome(); return;
      }
      install(next, route);
      // /new is a command. Canonicalize immediately so reload never creates another project.
      commit(destination, route.kind === 'new' ? localProjectPath(next.name, next.id) : destination.path, next.id);
      setPending(null);
    } catch {
      setError('projectSwitchError');
    }
  };
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      openRef.current({ path: window.location.pathname, state: window.history.state as unknown, replace: true }, true);
    }
    const pop = () => {
      const destination = { path: window.location.pathname, state: window.history.state as unknown, replace: true };
      // Keep URL and document aligned while a replacement confirmation is pending.
      window.history.replaceState(current.current.state, '', current.current.path);
      openRef.current(destination);
    };
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, []);
  return {
    error, pending: pending ? parseProjectRoute(pending.path) : null,
    navigate: (path: string) => open({ path, state: null, replace: false }),
    cancel: () => setPending(null),
    confirm: () => { if (pending) open(pending, false, true); },
    // Imports and resets become local even when their previous URL was a public template.
    adoptLocal: (next: CircuitProject) => commit({ path: '', state: null, replace: true }, localProjectPath(next.name, next.id), next.id),
  };
}
