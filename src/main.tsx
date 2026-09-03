import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { installPocketTtsBridge } from './services/pocketTtsBridge';
import { installPocketTtsPersistenceBridge } from './services/pocketTtsPersistenceBridge';
import App from './App.tsx';
import './index.css';

// These bridges only install lightweight method hooks; they must not load the
// Pocket TTS model before React mounts.
installPocketTtsBridge();
installPocketTtsPersistenceBridge();

const root = createRoot(document.getElementById('root')!);
root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Offline infrastructure is never a prerequisite for React interaction.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const baseUrl = new URL(import.meta.env.BASE_URL, window.location.href);
    const swUrl = new URL('sw.js', baseUrl);
    navigator.serviceWorker.register(swUrl.pathname, {scope: baseUrl.pathname})
      .then((registration) => {
        console.info('[VoiceCraft] Offline shell registered:', registration.scope);
      })
      .catch((error) => {
        console.warn('[VoiceCraft] Offline shell registration unavailable:', error);
      });
  }, {once: true});
}