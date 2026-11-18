import type { ThunkAction, UnknownAction } from '@reduxjs/toolkit';
import type { RootState } from '../../app/store';
import type { Credentials } from '../../services/api/contracts';
import type { ApiRuntime } from '../../services/api/runtime';
import { authApi } from '../../services/api/authApi';
import { sessionEnded } from './authSlice';

export type AuthMode = 'login' | 'register';
type Operation = ReturnType<ReturnType<typeof authApi.endpoints.login.initiate>>;
/** The thunk closure is consumed by thunk middleware. Only an opaque ID reaches RTK Query. */
export function submitAuthentication(mode: AuthMode, credentials: Credentials): ThunkAction<Operation, RootState, ApiRuntime, UnknownAction> {
  return (dispatch, _getState, runtime) => {
    dispatch(sessionEnded(null));
    const id = runtime.stageCredentials(credentials);
    return dispatch(authApi.endpoints[mode].initiate(id));
  };
}
