import type { BaseQueryApi, FetchArgs } from '@reduxjs/toolkit/query';
import { baseApi, clientError } from './baseApi';
import type { sessionBaseQuery } from './baseApi';
import { isAuth, isUser, publicUser } from './contracts';
import type { UserResponse } from './contracts';
import { apiRuntime } from './runtime';
import { profileReceived, sessionStarted } from '../../features/auth/authSlice';

async function authenticate(path: string, id: string, api: BaseQueryApi,
  query: (args: string | FetchArgs) => ReturnType<typeof sessionBaseQuery>) {
  const runtime = apiRuntime(api.extra);
  const entry = runtime.takeCredentials(id);
  if (!entry || entry.epoch !== runtime.epoch) return { error: clientError('session-changed') };
  const startedAt = Date.now();
  const result = await query({ url: path, method: 'POST', body: entry.credentials });
  if (result.error) return { error: result.error };
  if (!isAuth(result.data)) return { error: clientError('invalid-response') };
  const user = publicUser(result.data.user);
  const expiresAt = startedAt + result.data.expiresIn * 1000;
  if (expiresAt <= Date.now() || api.signal.aborted
    || !runtime.authenticate(entry.epoch, result.data.accessToken, user.id, expiresAt)) {
    return { error: clientError('session-changed') };
  }
  api.dispatch(sessionStarted({ user, expiresAt, epoch: entry.epoch }));
  // Only the public user is cached; the JWT stays in ApiRuntime.
  return { data: user };
}
export const authApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    login: build.mutation<UserResponse, string>({
      extraOptions: { public: true },
      queryFn: (id, api, _options, query) => authenticate('/auth/login', id, api, query),
    }),
    register: build.mutation<UserResponse, string>({
      extraOptions: { public: true },
      queryFn: (id, api, _options, query) => authenticate('/auth/register', id, api, query),
    }),
    me: build.query<UserResponse, void>({
      async queryFn(_arg, api, _options, query) {
        const result = await query('/auth/me');
        if (result.error) return { error: result.error };
        if (!isUser(result.data) || result.data.id !== apiRuntime(api.extra).userId) return { error: clientError('invalid-response') };
        const user = publicUser(result.data);
        api.dispatch(profileReceived(user));
        return { data: user };
      },
    }),
  }),
});
export const { useMeQuery } = authApi;
