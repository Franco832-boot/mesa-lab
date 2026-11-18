import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query';
import { API_BASE_URL, API_TIMEOUT_MS } from './config';
import { apiRuntime } from './runtime';

export function clientError(error: string, data?: unknown): FetchBaseQueryError {
  return data === undefined ? { status: 'CUSTOM_ERROR', error } : { status: 'CUSTOM_ERROR', error, data };
}
const transport = fetchBaseQuery({
  baseUrl: API_BASE_URL, credentials: 'omit', cache: 'no-store', redirect: 'error',
  timeout: API_TIMEOUT_MS, headers: { Accept: 'application/json' },
});
export const sessionBaseQuery: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError, { public?: boolean }> =
  async (args, api, options = {}) => {
    const runtime = apiRuntime(api.extra);
    const epoch = runtime.epoch;
    const authorization = options.public ? null : runtime.authorization();
    if (!options.public && !authorization) return { error: { status: 401, data: null } };
    const controller = new AbortController();
    const abort = () => controller.abort();
    api.signal.addEventListener('abort', abort, { once: true });
    if (api.signal.aborted) abort();
    const untrack = runtime.track(controller);
    const request = typeof args === 'string' ? { url: args } : args;
    const headers = new Headers();
    if (request.headers instanceof Headers) request.headers.forEach((value, key) => headers.set(key, value));
    else if (Array.isArray(request.headers)) {
      for (const [key, value] of request.headers) if (key !== undefined && value !== undefined) headers.set(key, value);
    } else if (request.headers) {
      for (const [key, value] of Object.entries(request.headers)) if (value !== undefined) headers.set(key, value);
    }
    if (authorization) headers.set('Authorization', authorization);
    try {
      const result = await transport({ ...request, headers }, { ...api, signal: controller.signal }, options);
      if (runtime.epoch !== epoch || controller.signal.aborted) return { error: clientError('session-changed') };
      if (!options.public && result.error?.status === 401) {
        runtime.onExpired();
        return { error: result.error };
      }
      // Request/Response metadata can retain authorization headers and password bodies.
      return result.error ? { error: result.error } : { data: result.data };
    } finally {
      untrack();
      api.signal.removeEventListener('abort', abort);
    }
  };
export const baseApi = createApi({
  reducerPath: 'api', baseQuery: sessionBaseQuery,
  tagTypes: ['Projects'], keepUnusedDataFor: 0,
  endpoints: () => ({}),
});
