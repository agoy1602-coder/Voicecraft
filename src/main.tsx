import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { installPocketTtsBridge } from './services/pocketTtsBridge';
import App from './App.tsx';
import './index.css';

const root = createRoot(document.getElementById('root')!);
root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Offline infrastructure must never be a prerequisite for React interaction.
try {
  installPocketTtsBridge();
} catch (error) {
  console.error('[VoiceCraft] Pocket TTS bridge installation failed:', error);
}

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
