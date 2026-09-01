import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import './services/pocketTtsBridge';
import { installPocketTtsBridge } from './services/pocketTtsBridge';
import App from './App.tsx';
import './index.css';

installPocketTtsBridge();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
