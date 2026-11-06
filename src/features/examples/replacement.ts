import { newId } from '../../model/components';
import { serializeProject } from '../../model/project';
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
