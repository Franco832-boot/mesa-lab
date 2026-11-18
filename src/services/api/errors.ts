import type { TranslationKey } from '../../locales/es/messages';
import { record } from './contracts';
export function apiErrorMessage(error: unknown): TranslationKey {
  if (!record(error)) return 'apiError';
  if (error.status === 'FETCH_ERROR' || error.status === 'TIMEOUT_ERROR') return 'apiConnectionError';
  if (error.status === 401 || error.error === 'session-changed') return 'authExpired';
  if (error.status === 409 || error.status === 412) return 'cloudConflict';
  if (typeof error.status === 'number' && error.status >= 500) return 'apiServerError';
  if (error.status === 'PARSING_ERROR') return typeof error.originalStatus === 'number' && error.originalStatus >= 500 ? 'apiServerError' : 'apiInvalidResponse';
  if (error.status === 429) return 'authRateLimit';
  if (error.status === 400) return 'apiValidationError';
  if (error.status === 413 || error.error === 'project-too-large') return 'cloudTooLarge';
  if (error.status === 404) return 'cloudNotFound';
  if (error.error === 'create-busy') return 'cloudBusy';
  if (error.error === 'save-uncertain') return 'cloudUncertain';
  if (error.error === 'invalid-document') return 'cloudInvalidDocument';
  if (error.error === 'invalid-project-response') return 'apiProjectContractError';
  if (error.error === 'project-owner-mismatch') return 'cloudOwnerMismatch';
  if (error.error === 'local-backup-failed') return 'saveError';
  return 'apiError';
}
/** Safe diagnostics only. Never display raw HTML, backend internals, tokens or document bodies. */
export function apiErrorCode(error: unknown): string | null {
  if (!record(error)) return null;
  if (typeof error.status === 'number') return `HTTP ${error.status}`;
  if (error.status === 'PARSING_ERROR' && typeof error.originalStatus === 'number') return `HTTP ${error.originalStatus} · PARSING_ERROR`;
  if (record(error.data) && typeof error.data.httpStatus === 'number') return `HTTP ${error.data.httpStatus} · ${String(error.error)}`;
  if (error.status === 'FETCH_ERROR' || error.status === 'TIMEOUT_ERROR') return error.status;
  return null;
}
