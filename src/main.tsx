import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { installPocketTtsBridge } from './services/pocketTtsBridge';
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

// Diagnostic branch only: mount React first, then register the service worker.
// This isolates whether pre-React SW registration contributes to offline-refresh failure.
if ('serviceWorker' in navigator && sessionStorage.getItem('offline-sw-unregister-test') !== 'done') { navigator.serviceWorker.getRegistrations().then(async (registrations) => { sessionStorage.setItem('offline-sw-unregister-test', 'done'); await Promise.all(registrations.map((registration) => registration.unregister())); location.reload(); }); }
queueMicrotask(() => {
  installPocketTtsBridge();
});
