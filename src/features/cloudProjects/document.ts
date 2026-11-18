import { parseProject, serializeProject } from '../../model/project';
import type { CircuitProject } from '../../model/types';
import { isJsonObject } from '../../services/api/contracts';
import type { CreateProjectRequest, JsonValue, ProjectResponse } from '../../services/api/contracts';

export const MAX_CLOUD_DOCUMENT_BYTES = 256 * 1024;
export class CloudDocumentError extends Error {
  constructor(readonly code: 'project-too-large' | 'invalid-document') { super(code); }
}
export function cloudDocumentSize(data: unknown): number {
  return new TextEncoder().encode(JSON.stringify(data)).length;
}
export function prepareCloudProject(project: CircuitProject, name: string): CreateProjectRequest {
  let data: unknown;
  try { data = JSON.parse(serializeProject(project)); }
  catch { throw new CloudDocumentError('invalid-document'); }
  if (!isJsonObject(data)) throw new CloudDocumentError('invalid-document');
  if (cloudDocumentSize(data) > MAX_CLOUD_DOCUMENT_BYTES) throw new CloudDocumentError('project-too-large');
  if (!name.trim() || name.trim().length > 120) throw new CloudDocumentError('invalid-document');
  return { name: name.trim(), data };
}
/** JSONB may reorder object keys. Arrays, document IDs and every saved field still matter. */
export function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => {
    const child = value[key];
    return `${JSON.stringify(key)}:${child === undefined ? 'null' : canonicalJson(child)}`;
  }).join(',')}}`;
}
export function readCloudProject(response: ProjectResponse): CircuitProject {
  // The backend accepts arbitrary JSONB, including objects that are not simulator documents.
  try { return parseProject(JSON.stringify(response.data)); }
  catch { throw new CloudDocumentError('invalid-document'); }
}
