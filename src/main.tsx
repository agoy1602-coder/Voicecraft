import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import { installPocketTtsBridge } from './services/pocketTtsBridge';
import App from './App.tsx';
import './index.css';

const root = createRoot(document.getElementById('root')!);
root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Register the service worker only after React has mounted. SW registration
// must never be part of the critical UI bootstrap path.
queueMicrotask(() => {
  registerSW({ immediate: false });
  installPocketTtsBridge();
});
