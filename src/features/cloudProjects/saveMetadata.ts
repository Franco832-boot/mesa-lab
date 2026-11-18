import type { CreateProjectRequest } from '../../services/api/contracts';
import { isJsonObject, record, uuid, validProjectVersion } from '../../services/api/contracts';
import type { CircuitProject } from '../../model/types';
import { serializeProject } from '../../model/project';

export interface RemoteProjectIdentity { id: string; userId: string; version: number }
/** Immutable request receipt. Never edited; replay the exact body and key after uncertainty. */
export interface PendingProjectSave {
  key: string;
  userId: string;
  target: { id: string; version: number } | null;
  body: CreateProjectRequest;
}
export interface CloudProjectLink {
  documentId: string;
  remote: RemoteProjectIdentity | null;
  savedFingerprint: string | null;
  pending: PendingProjectSave | null;
}
export type CloudSaveStatus = { documentId: string; phase: 'saving' | 'error' | 'conflict'; error: unknown } | null;
/** Does not enforce the cloud size limit: large local drafts still need a dirty indicator. */
export function projectFingerprint(project: CircuitProject): string {
  // The existing parser reconstructs fields in deterministic order, including JSONB reads.
  return serializeProject(project);
}
export function createSaveKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  // Secure-context-only randomUUID may be unavailable on an HTTP LAN origin.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function isTarget(value: unknown): value is { id: string; version: number } {
  return record(value) && uuid(value.id) && validProjectVersion(value.version);
}
function isRemote(value: unknown): value is RemoteProjectIdentity {
  return record(value) && uuid(value.userId) && isTarget(value);
}
function isPending(value: unknown): value is PendingProjectSave {
  return record(value) && uuid(value.key) && uuid(value.userId) && (value.target === null || isTarget(value.target))
    && record(value.body) && typeof value.body.name === 'string' && value.body.name.trim() === value.body.name
    && value.body.name.length > 0 && value.body.name.length <= 120 && isJsonObject(value.body.data);
}
export function isCloudProjectLinks(value: unknown): value is CloudProjectLink[] {
  if (!Array.isArray(value)) return false;
  const ids = new Set<string>();
  return value.every((link: unknown) => {
    if (!record(link) || typeof link.documentId !== 'string' || !link.documentId || ids.has(link.documentId)) return false;
    ids.add(link.documentId);
    if (!(link.remote === null || isRemote(link.remote))) return false;
    return (link.savedFingerprint === null || typeof link.savedFingerprint === 'string')
      && (link.pending === null || (isPending(link.pending) && (link.remote === null ? link.pending.target === null
        : link.pending.target?.id === link.remote.id && link.pending.target.version === link.remote.version
          && link.pending.userId === link.remote.userId)));
  });
}
