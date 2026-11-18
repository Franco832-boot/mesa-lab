import { describe, expect, it } from 'vitest';
import { apiErrorCode, apiErrorMessage } from './errors';

describe('safe and actionable cloud diagnostics', () => {
  it.each([
    [{ status: 'FETCH_ERROR' }, 'apiConnectionError', 'FETCH_ERROR'],
    [{ status: 'TIMEOUT_ERROR' }, 'apiConnectionError', 'TIMEOUT_ERROR'],
    [{ status: 401 }, 'authExpired', 'HTTP 401'],
    [{ status: 409 }, 'cloudConflict', 'HTTP 409'],
    [{ status: 412 }, 'cloudConflict', 'HTTP 412'],
    [{ status: 500 }, 'apiServerError', 'HTTP 500'],
    [{ status: 'PARSING_ERROR', originalStatus: 502 }, 'apiServerError', 'HTTP 502 · PARSING_ERROR'],
    [{ status: 'PARSING_ERROR', originalStatus: 200 }, 'apiInvalidResponse', 'HTTP 200 · PARSING_ERROR'],
    [{ status: 'CUSTOM_ERROR', error: 'invalid-project-response', data: { httpStatus: 200 } }, 'apiProjectContractError', 'HTTP 200 · invalid-project-response'],
  ])('distinguishes %j without rendering server content', (error, message, code) => {
    expect(apiErrorMessage(error)).toBe(message); expect(apiErrorCode(error)).toBe(code);
  });
  it('never exposes response bodies, HTML or credentials as diagnostic codes', () => {
    expect(apiErrorCode({ status: 'CUSTOM_ERROR', data: '<html>private</html>', error: 'secret' })).toBeNull();
  });
});
