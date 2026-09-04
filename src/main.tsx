import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import { installPocketTtsBridge } from './services/pocketTtsBridge';
import { pocketTtsService } from './services/pocketTtsService';
import App from './App.tsx';
import './index.css';

registerSW({immediate: true});
installPocketTtsBridge();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Warm Pocket TTS after the application has loaded while the network is
// available. The service shares the same idempotent load promise used by
// Create Clone, so this prepares the exact assets needed for airplane mode
// without changing the clone path itself.
window.addEventListener('load', () => {
  window.setTimeout(() => {
    if (!navigator.onLine) return;
    pocketTtsService.warmup().catch((error) => {
      console.warn('[VoiceCraft] Pocket TTS warmup deferred:', error);
    });
  }, 1000);
});
