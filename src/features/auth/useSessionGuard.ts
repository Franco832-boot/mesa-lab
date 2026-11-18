import { useStore } from 'react-redux';
import type { AppStore } from '../../app/store';
import { useAppSelector } from '../../app/hooks';
import { sessionEnded } from './authSlice';
const useAppStore = useStore.withTypes<AppStore>();

/** Check current store state at the moment of an explicit action, even before React rerenders. */
export function useSessionGuard() {
  const store = useAppStore();
  const epoch = useAppSelector(state => state.auth.epoch);
  return () => {
    const auth = store.getState().auth;
    if (auth.epoch !== epoch || !auth.user || auth.expiresAt === null) return false;
    if (auth.expiresAt <= Date.now()) { store.dispatch(sessionEnded('expired')); return false; }
    return true;
  };
}
