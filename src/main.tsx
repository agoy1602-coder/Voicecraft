import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { startOfflineBootstrapDiagnostics } from './diagnostics/offlineBootstrapDiagnostics';
import App from './App.tsx';
import './index.css';

startOfflineBootstrapDiagnostics();

const root = createRoot(document.getElementById('root')!);
root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Diagnostic branch only: mount React first, then unregister any existing
// service workers. Pocket TTS is intentionally NOT loaded here. Its bridge is
// excluded from the initial module graph so we can determine whether its
// module evaluation contributes to the frozen UI.
if ('serviceWorker' in navigator && sessionStorage.getItem('offline-sw-unregister-test') !== 'done') { navigator.serviceWorker.getRegistrations().then(async (registrations) => { sessionStorage.setItem('offline-sw-unregister-test', 'done'); await Promise.all(registrations.map((registration) => registration.unregister())); location.reload(); }); }
