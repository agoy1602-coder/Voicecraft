import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { installPocketTtsBridge } from './services/pocketTtsBridge';
import { installPocketTtsPersistenceBridge } from './services/pocketTtsPersistenceBridge';
import App from './App.tsx';
import './index.css';

installPocketTtsBridge();
installPocketTtsPersistenceBridge();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
