import { createRoot } from 'react-dom/client';
import { Application } from './app/Application';
import './app/styles.css';
import { createAppStore } from './app/store';

// Access storage lazily so a browser denying localStorage still renders the app.
const application = createAppStore({
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
  removeItem: (key) => localStorage.removeItem(key),
});

const root = document.getElementById('root');
if (!root) throw new Error('Missing root element');

createRoot(root).render(<Application application={application} />);
