import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import { installPocketTtsBridge } from './services/pocketTtsBridge';
import { readPocketTtsDiagnostic } from './services/pocketTtsPersistentDiagnostic';
import App from './App.tsx';
import './index.css';

registerSW({immediate: true});

const previousPocketTtsDiagnostic = readPocketTtsDiagnostic();
if (previousPocketTtsDiagnostic) {
  (globalThis as any).__VC_PREVIOUS_POCKET_DIAGNOSTIC__ = previousPocketTtsDiagnostic;
  console.log('[VC-DIAG] Previous persisted Pocket TTS state:', previousPocketTtsDiagnostic);
}

installPocketTtsBridge();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Prepare Pocket TTS model assets outside the UI thread. The worker only
// downloads/caches the eight model resources; it never constructs ORT
// sessions or initializes the inference engine. Create Clone remains lazy.
window.addEventListener('load', () => {
  window.setTimeout(() => {
    if (!navigator.onLine) return;

    const worker = new Worker(
      new URL('./services/pocketTtsPreload.worker.ts', import.meta.url),
      { type: 'module' },
    );

    worker.onmessage = (event) => {
      if (event.data?.type === 'ready') {
        console.log('[VoiceCraft] Pocket TTS assets cached for offline use.');
        worker.terminate();
      } else if (event.data?.type === 'error' || event.data?.type === 'skipped') {
        console.warn('[VoiceCraft] Pocket TTS asset warmup deferred:', event.data?.message || event.data?.reason);
        worker.terminate();
      }
    };

    worker.onerror = (event) => {
      console.warn('[VoiceCraft] Pocket TTS preload worker failed:', event.message);
      worker.terminate();
    };

    worker.postMessage({ type: 'warmup' });
  }, 1000);
});