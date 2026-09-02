type DiagnosticState = {
  startedAt: string;
  reactRootMounted: boolean;
  serviceWorkerSupported: boolean;
  serviceWorkerController: string;
  serviceWorkerReady: string;
  online: boolean;
  lastError: string;
  lastRejection: string;
};

const state: DiagnosticState = {
  startedAt: new Date().toISOString(),
  reactRootMounted: false,
  serviceWorkerSupported: 'serviceWorker' in navigator,
  serviceWorkerController: navigator.serviceWorker?.controller ? 'present' : 'absent',
  serviceWorkerReady: 'pending',
  online: navigator.onLine,
  lastError: '',
  lastRejection: '',
};

function render() {
  const panel = document.getElementById('voicecraft-offline-diagnostic');
  if (!panel) return;
  panel.textContent = [
    'VoiceCraft Offline Bootstrap Diagnostic',
    `React root mounted: ${state.reactRootMounted}`,
    `Service Worker supported: ${state.serviceWorkerSupported}`,
    `Service Worker controller: ${state.serviceWorkerController}`,
    `Service Worker ready: ${state.serviceWorkerReady}`,
    `Network: ${state.online ? 'online' : 'offline'}`,
    `Last error: ${state.lastError || 'none'}`,
    `Last rejection: ${state.lastRejection || 'none'}`,
  ].join('\n');
}

function mountPanel() {
  if (!new URLSearchParams(location.search).has('offline-diagnostic')) return;
  const panel = document.createElement('pre');
  panel.id = 'voicecraft-offline-diagnostic';
  panel.style.cssText = [
    'position:fixed',
    'left:8px',
    'right:8px',
    'bottom:8px',
    'z-index:2147483647',
    'margin:0',
    'padding:10px',
    'border-radius:8px',
    'background:#111827',
    'color:#f9fafb',
    'font:12px/1.45 monospace',
    'white-space:pre-wrap',
    'pointer-events:none',
    'max-height:45vh',
    'overflow:auto',
  ].join(';');
  document.body.appendChild(panel);
  render();
}

export function startOfflineBootstrapDiagnostics() {
  mountPanel();
  render();

  window.addEventListener('error', (event) => {
    state.lastError = event.error?.stack || event.message || 'Unknown window error';
    render();
  });

  window.addEventListener('unhandledrejection', (event) => {
    state.lastRejection = String(event.reason?.stack || event.reason || 'Unknown rejection');
    render();
  });

  window.addEventListener('online', () => {
    state.online = true;
    render();
  });

  window.addEventListener('offline', () => {
    state.online = false;
    render();
  });

  if (state.serviceWorkerSupported) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      state.serviceWorkerController = 'changed/present';
      render();
    });

    navigator.serviceWorker.ready
      .then(() => {
        state.serviceWorkerReady = 'ready';
        state.serviceWorkerController = navigator.serviceWorker.controller ? 'present' : 'absent';
        render();
      })
      .catch((error) => {
        state.serviceWorkerReady = `error: ${String(error)}`;
        render();
      });
  }

  const root = document.getElementById('root');
  if (root) {
    const observer = new MutationObserver(() => {
      if (root.childElementCount > 0) {
        state.reactRootMounted = true;
        render();
        observer.disconnect();
      }
    });
    observer.observe(root, { childList: true });
    if (root.childElementCount > 0) {
      state.reactRootMounted = true;
      render();
      observer.disconnect();
    }
  }

  render();
}
