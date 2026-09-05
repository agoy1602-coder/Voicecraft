import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import { installPocketTtsBridge } from './services/pocketTtsBridge';
import App from './App.tsx';
import './index.css';

registerSW({immediate: true});
installPocketTtsBridge();

function startPocketTtsPreload() {
  if (!navigator.onLine) return;

  const worker = new Worker(new URL('./workers/pocketTtsPreloadWorker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event) => {
    const message = event.data;
    if (message?.type === 'progress') {
      console.debug('[VoiceCraft] Pocket TTS cache', message.index, '/', message.total, message.name, message.fromCache ? '(cached)' : '(downloaded)');
    } else if (message?.type === 'ready') {
      console.info('[VoiceCraft] Pocket TTS offline cache ready:', message.cached, '/', message.total);
      worker.terminate();
    } else if (message?.type === 'incomplete') {
      console.warn('[VoiceCraft] Pocket TTS offline cache incomplete:', message.missing);
      worker.terminate();
    } else if (message?.type === 'asset-error') {
      console.warn('[VoiceCraft] Pocket TTS asset failed:', message.name, message.error);
    } else if (message?.type === 'error') {
      console.warn('[VoiceCraft] Pocket TTS preload failed:', message.error);
      worker.terminate();
    }
  };
  worker.onerror = (event) => {
    console.warn('[VoiceCraft] Pocket TTS preload worker error:', event.message);
    worker.terminate();
  };
  worker.postMessage({ type: 'preload' });
}

// Ask the browser to protect the large offline model cache from routine eviction.
// This does not increase the quota; the preload worker still verifies every asset.
if (navigator.storage?.persist) {
  navigator.storage.persist().catch(() => undefined);
}

// Never put model downloads on the React/main-thread startup path. Give the app
// a chance to mount and become interactive first, then warm the cache in a worker.
setTimeout(startPocketTtsPreload, 1500);
window.addEventListener('online', () => setTimeout(startPocketTtsPreload, 500));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
