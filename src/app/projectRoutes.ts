import type { ExampleId } from '../model/exampleProjects';
import { projectExamples } from '../model/exampleProjects';
import type { CircuitProject } from '../model/types';
import { EXAMPLE_BACKUP_PREFIX, listProjectCopies, readProjectCopy } from '../features/examples/replacement';

/** Public URLs identify curated templates only, never user-authored documents. */
export const examplePaths: Readonly<Record<ExampleId, string>> = {
  'esp-chat-led': '/esp8266-led-telegram',
  'esp-web-led': '/esp8266-led-web',
  dht11: '/arduino-dht11',
  'led-millis': '/arduino-led-millis',
  'led-for': '/arduino-led-for',
  'lcd16-parallel': '/arduino-lcd-16x2-parallel',
  'lcd20-parallel': '/arduino-lcd-20x4-parallel',
  'lcd16-i2c': '/arduino-lcd-16x2-i2c',
  'lcd20-i2c': '/arduino-lcd-20x4-i2c',
};
export type ProjectRoute = { kind: 'home' } | { kind: 'new' }
  | { kind: 'example'; id: ExampleId } | { kind: 'local'; token: string } | { kind: 'missing' };

export function parseProjectRoute(path: string): ProjectRoute {
  const normalized = path === '/' ? path : path.replace(/\/$/, '');
  if (path === '/') return { kind: 'home' };
  if (normalized === '/new') return { kind: 'new' };
  const example = projectExamples.find((item) => examplePaths[item.id] === normalized);
  if (example) return { kind: 'example', id: example.id };
  const match = /^\/local\/[^/]+\/([^/]+)$/.exec(normalized);
  try {
    const token = match?.[1];
    if (token) return { kind: 'local', token: decodeURIComponent(token) };
  } catch { /* Invalid escapes are an unknown route, never a document lookup. */ }
  return { kind: 'missing' };
}

export function localProjectPath(name: string, token: string): string {
  const slug = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'project';
  return `/local/${slug}/${encodeURIComponent(token)}`;
}

export function findLocalProject(storage: Storage, token: string, current: CircuitProject): CircuitProject | null {
  if (token === current.id) return current;
  if (token.startsWith(EXAMPLE_BACKUP_PREFIX)) return readProjectCopy(storage, token);
  // A previous history entry can identify a document now preserved in a snapshot.
  const copy = listProjectCopies(storage).copies.reverse().find((item) => item.projectId === token);
  return copy ? readProjectCopy(storage, copy.key) : null;
}
