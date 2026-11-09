import { newId } from '../../model/components';
import { parseProject, serializeProject } from '../../model/project';
import type { CircuitProject } from '../../model/types';

export const EXAMPLE_BACKUP_PREFIX = 'mesa.project.before-example.v1:';
/** Immutable project snapshot, never a second editable circuit. A failed
 * backup must leave the current project and running simulation untouched. */
export function preserveBeforeExample(storage: Pick<Storage, 'getItem' | 'setItem'>, project: CircuitProject, snapshotId = newId()): string {
  const key = `${EXAMPLE_BACKUP_PREFIX}${snapshotId}`;
  if (storage.getItem(key) !== null) throw new Error('example-backup-exists');
  const source = serializeProject(project);
  storage.setItem(key, source);
  if (storage.getItem(key) !== source) throw new Error('example-backup-failed');
  return key;
}

export interface ProjectCopy {
  key: string;
  projectId: string;
  name: string;
}
/** Read-only metadata for the existing immutable snapshots, not editable documents.
 * Equal snapshots are shown once; distinct revisions remain available. No old
 * keys or document bytes are rewritten, including entries that cannot be parsed. */
export function listProjectCopies(storage: Pick<Storage, 'getItem' | 'key' | 'length'>): { copies: ProjectCopy[]; unreadable: number } {
  const copies: ProjectCopy[] = [], seen = new Set<string>();
  let unreadable = 0;
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith(EXAMPLE_BACKUP_PREFIX)) continue;
    const source = storage.getItem(key);
    if (source === null) continue;
    try {
      const project = parseProject(source);
      const identity = serializeProject(project);
      if (seen.has(identity)) continue;
      seen.add(identity);
      copies.push({ key, projectId: project.id, name: project.name });
    } catch { unreadable++; }
  }
  return { copies, unreadable };
}
export function readProjectCopy(storage: Pick<Storage, 'getItem'>, key: string): CircuitProject {
  if (!key.startsWith(EXAMPLE_BACKUP_PREFIX)) throw new Error('invalid-project-copy');
  const source = storage.getItem(key);
  if (source === null) throw new Error('missing-project-copy');
  return parseProject(source);
}
