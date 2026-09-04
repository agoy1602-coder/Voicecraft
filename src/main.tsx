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

// Pre-cache the Pocket TTS assets after the UI is mounted. This warm-up is
// deliberately cache-only: it does not construct ONNX sessions or initialize
// the heavy inference engine, so the main UI remains responsive.
window.addEventListener('load', () => {
  window.setTimeout(() => {
    if (!navigator.onLine) return;
    pocketTtsService.warmup().catch((error) => {
      console.warn('[VoiceCraft] Pocket TTS asset warmup deferred:', error);
    });
  }, 1000);
});
