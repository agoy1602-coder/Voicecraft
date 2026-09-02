import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import { installPocketTtsBridge } from './services/pocketTtsBridge';
import App from './App.tsx';
import './index.css';
import { markVoiceCraftDiagnostic } from './diagnostics/offlineFreezeDiagnostic';

markVoiceCraftDiagnostic('MAIN_MODULE_LOADED');

markVoiceCraftDiagnostic('SW_REGISTER_BEGIN', {
  online: navigator.onLine,
  controller: Boolean(navigator.serviceWorker?.controller),
});
registerSW({immediate: true});
markVoiceCraftDiagnostic('SW_REGISTER_RETURNED');

markVoiceCraftDiagnostic('POCKET_BRIDGE_INSTALL_BEGIN');
installPocketTtsBridge();
markVoiceCraftDiagnostic('POCKET_BRIDGE_INSTALL_RETURNED');

markVoiceCraftDiagnostic('REACT_RENDER_BEGIN');
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
markVoiceCraftDiagnostic('REACT_RENDER_RETURNED');
