import { StrictMode } from 'react';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { LocaleProvider } from '../locales/LocaleProvider';
import { App } from './App';
import type { createAppStore } from './store';

/** Shared by the browser entry and mounted integration tests. */
export function Application({ application }: { application: ReturnType<typeof createAppStore> }) {
  return (
    <StrictMode>
      <Provider store={application.store}>
        <PersistGate loading={null} persistor={application.persistor}>
          <LocaleProvider>
            <App saveNow={application.saveNow} />
          </LocaleProvider>
        </PersistGate>
      </Provider>
    </StrictMode>
  );
}
