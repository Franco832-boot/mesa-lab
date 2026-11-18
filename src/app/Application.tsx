import { StrictMode, useEffect } from 'react';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { LocaleProvider } from '../locales/LocaleProvider';
import { App } from './App';
import type { createAppStore } from './store';

/** Shared by the browser entry and mounted integration tests. */
export function Application({ application }: { application: ReturnType<typeof createAppStore> }) {
  useEffect(() => {
    const backup = () => { application.backupNow(); };
    const online = () => { void application.projectSync.retryRemote(); };
    window.addEventListener('pagehide', backup);
    window.addEventListener('beforeunload', backup);
    window.addEventListener('online', online);
    return () => {
      window.removeEventListener('pagehide', backup);
      window.removeEventListener('beforeunload', backup);
      window.removeEventListener('online', online);
    };
  }, [application]);
  return (
    <StrictMode>
      <Provider store={application.store}>
        <PersistGate loading={null} persistor={application.persistor}>
          <LocaleProvider>
            <App saveProject={application.projectSync.save} />
          </LocaleProvider>
        </PersistGate>
      </Provider>
    </StrictMode>
  );
}
