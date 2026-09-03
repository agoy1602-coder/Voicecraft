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

// The UI must be able to mount before optional runtime infrastructure starts.
// Register the local offline shell and Pocket TTS bridge after the first paint.
const startOfflineRuntime = () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // Online/offline operation remains available without a new registration.
    });
  }

  try {
    installPocketTtsBridge();
  } catch {
    // Pocket TTS initializes lazily when the local engine is used.
  }
};

if ('requestIdleCallback' in window) {
  window.requestIdleCallback(startOfflineRuntime, {timeout: 1500});
} else {
  window.setTimeout(startOfflineRuntime, 0);
}
