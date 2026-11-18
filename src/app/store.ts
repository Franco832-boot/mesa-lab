import { configureStore } from '@reduxjs/toolkit';
import type { Middleware } from '@reduxjs/toolkit';
import { baseApi } from '../services/api/baseApi';
import { ApiRuntime } from '../services/api/runtime';
import { authReducer, sessionEnded } from '../features/auth/authSlice';
import {
  FLUSH,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER,
  REHYDRATE,
  persistReducer,
  persistStore,
} from 'redux-persist';
import type { PersistConfig } from 'redux-persist';
import { createProject, parseProject, STORAGE_KEY } from '../model/project';
import {
  checkpointRequested,
  persistenceFailed,
  persistenceSucceeded,
  projectReducer,
  projectReplaced,
  projectRestored,
  recoveryFailed,
} from '../features/project/projectSlice';
import type { ProjectState } from '../features/project/projectSlice';
import { decodePersistedProject, PERSIST_KEY, PERSIST_VERSION, RECOVERY_KEY } from './persistence';
import type { ProjectStorage, PersistedProject } from './persistence';

export function createAppStore(storage: ProjectStorage) {
  const runtime = new ApiRuntime();
  const sessionMiddleware: Middleware = (api) => (next) => (action) => {
    if (sessionEnded.match(action)) runtime.clear();
    const result = next(action);
    if (sessionEnded.match(action)) {
      api.dispatch(baseApi.util.resetApiState());
    }
    return result;
  };
  let writeFailed = false;
  let unsafeSource: string | null = null;
  let writesBlocked = false;
  const config: PersistConfig<ProjectState> = {
    key: 'mesa.project',
    version: PERSIST_VERSION,
    whitelist: ['document'],
    throttle: 150,
    storage: {
      getItem: async (key: string) => storage.getItem(key),
      setItem: async (key: string, value: string) => {
        // Redux Persist may call this during its FLUSH reducer. Notify the
        // store only after that reducer has returned.
        await Promise.resolve();
        try {
          if (writesBlocked) throw new Error('recovery-backup-required');
          storage.setItem(key, value);
          writeFailed = false;
          store.dispatch(persistenceSucceeded());
        } catch (error: unknown) {
          writeFailed = true;
          store.dispatch(persistenceFailed());
          throw error;
        }
      },
      removeItem: async (key: string) => storage.removeItem(key),
    },
    getStoredState: async (): Promise<PersistedProject | undefined> => {
      // PERSIST also starts recovery from inside the wrapper reducer.
      await Promise.resolve();
      try {
        const current = storage.getItem(PERSIST_KEY);
        unsafeSource = current;
        if (current !== null) {
          const decoded = decodePersistedProject(current);
          store.dispatch(projectRestored());
          unsafeSource = null;
          return decoded;
        }
        const legacy = storage.getItem(STORAGE_KEY);
        unsafeSource = legacy;
        if (legacy !== null) {
          const document = parseProject(legacy);
          store.dispatch(projectRestored());
          unsafeSource = null;
          return { document, _persist: { version: PERSIST_VERSION, rehydrated: false } };
        }
        return undefined;
      } catch {
        store.dispatch(recoveryFailed());
        if (unsafeSource !== null) {
          try {
            storage.setItem(RECOVERY_KEY, unsafeSource);
          } catch {
            writesBlocked = true;
          }
        }
        return undefined;
      }
    },
  };
  const store = configureStore({
    reducer: { project: persistReducer<ProjectState>(config, projectReducer), auth: authReducer, [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        thunk: { extraArgument: runtime },
        serializableCheck: { ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER] },
      }).concat(sessionMiddleware, baseApi.middleware),
    devTools: import.meta.env.DEV,
  });
  runtime.onExpired = () => { store.dispatch(sessionEnded('expired')); };
  store.dispatch(projectReplaced(createProject()));
  const persistor = persistStore(store);
  const saveNow = async (): Promise<boolean> => {
    if (writesBlocked && unsafeSource !== null) {
      try {
        storage.setItem(RECOVERY_KEY, unsafeSource);
        writesBlocked = false;
      } catch {
        store.dispatch(persistenceFailed());
        return false;
      }
    }
    store.dispatch(checkpointRequested());
    await persistor.flush();
    return !writeFailed;
  };
  return { store, persistor, saveNow };
}
export type AppStore = ReturnType<typeof createAppStore>['store'];
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
