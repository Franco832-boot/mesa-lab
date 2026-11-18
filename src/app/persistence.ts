import type { PersistState } from 'redux-persist';
import { parseProject } from '../model/project';
import type { CircuitProject } from '../model/types';
import { isCloudProjectLinks } from '../features/cloudProjects/saveMetadata';
import type { CloudProjectLink } from '../features/cloudProjects/saveMetadata';

export const PERSIST_VERSION = 2;
export const PERSIST_KEY = 'persist:mesa.project';
export const RECOVERY_KEY = 'mesa.project.recovery';
export type ProjectStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export interface PersistedProject {
  document: CircuitProject;
  cloudLinks: CloudProjectLink[];
  _persist: PersistState;
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/** Storage version is independent of the exported circuit format version.
 * v0 used `project`; v1 names the persisted document `document`.
 * v2 adds durable remote identities and immutable in-flight write receipts.
 */
export function migratePersistedProject(value: unknown): PersistedProject {
  if (!record(value) || !record(value._persist) || !Number.isInteger(value._persist.version))
    throw new Error('invalid-persisted-state');
  const version = value._persist.version;
  if (version !== 0 && version !== 1 && version !== PERSIST_VERSION) throw new Error('unsupported-storage-version');
  const document = parseProject(JSON.stringify(version === 0 ? value.project : value.document));
  const cloudLinks = version === 2 ? value.cloudLinks : [];
  if (!isCloudProjectLinks(cloudLinks)) throw new Error('invalid-cloud-metadata');
  return { document, cloudLinks, _persist: { version: PERSIST_VERSION, rehydrated: false } };
}
/** Redux Persist serializes each top-level entry separately. Decode only known keys. */
export function decodePersistedProject(source: string): PersistedProject {
  const envelope: unknown = JSON.parse(source);
  if (!record(envelope) || typeof envelope._persist !== 'string')
    throw new Error('invalid-persistence-envelope');
  const metadata: unknown = JSON.parse(envelope._persist);
  if (!record(metadata)) throw new Error('invalid-persistence-metadata');
  const key = metadata.version === 0 ? 'project' : 'document';
  const sourceDocument = envelope[key];
  if (typeof sourceDocument !== 'string') throw new Error('invalid-persistence-document');
  const document: unknown = JSON.parse(sourceDocument);
  const cloudLinks: unknown = metadata.version === 2 && typeof envelope.cloudLinks === 'string' ? JSON.parse(envelope.cloudLinks) : undefined;
  return migratePersistedProject({ [key]: document, cloudLinks, _persist: metadata });
}
