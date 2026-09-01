import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import { installPocketTtsBridge } from './services/pocketTtsBridge';
import App from './App.tsx';
import './index.css';

registerSW({immediate: true});
installPocketTtsBridge();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
