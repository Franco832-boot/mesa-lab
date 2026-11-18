import type { TranslationKey } from '../../locales/es/messages';
import { record } from './contracts';
export function apiErrorMessage(error: unknown): TranslationKey {
  if (!record(error)) return 'apiError';
  if (error.status === 'FETCH_ERROR' || error.status === 'TIMEOUT_ERROR') return 'apiConnectionError';
  if (error.status === 401 || error.error === 'session-changed') return 'authExpired';
  if (error.status === 409) return 'authEmailConflict';
  if (error.status === 429) return 'authRateLimit';
  if (error.status === 400) return 'apiValidationError';
  if (error.status === 413 || error.error === 'project-too-large') return 'cloudTooLarge';
  if (error.status === 404) return 'cloudNotFound';
  if (error.error === 'create-busy') return 'cloudBusy';
  if (error.error === 'save-uncertain') return 'cloudUncertain';
  if (error.error === 'invalid-document') return 'cloudInvalidDocument';
  return 'apiError';
}
