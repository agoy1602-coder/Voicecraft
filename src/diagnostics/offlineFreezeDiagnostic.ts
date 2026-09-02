type DiagnosticState = {
  startedAt: number;
  lastHeartbeat: number;
  heartbeatCount: number;
  lastPointerTarget: string;
  lastPointerAt: number;
  lastError: string;
  lastRejection: string;
  longTaskCount: number;
  lastLongTask: string;
};

const state: DiagnosticState = {
  startedAt: performance.now(),
  lastHeartbeat: performance.now(),
  heartbeatCount: 0,
  lastPointerTarget: 'none',
  lastPointerAt: 0,
  lastError: 'none',
  lastRejection: 'none',
  longTaskCount: 0,
  lastLongTask: 'none',
};

const stamp = () => `[VC-OFFLINE-DIAG +${Math.round(performance.now() - state.startedAt)}ms]`;
const log = (...args: unknown[]) => console.info(stamp(), ...args);

function describeElement(el: Element | null): string {
  if (!el) return 'null';
  const id = el.id ? `#${el.id}` : '';
  const classes = typeof el.className === 'string' && el.className.trim()
    ? `.${el.className.trim().split(/\\s+/).slice(0, 3).join('.')}`
    : '';
  return `${el.tagName.toLowerCase()}${id}${classes}`;
}

function record(label: string, value?: unknown) {
  log(label, value ?? '');
}

record('BOOTSTRAP_START', {
  online: navigator.onLine,
  readyState: document.readyState,
  visibility: document.visibilityState,
  controller: Boolean(navigator.serviceWorker?.controller),
});

window.addEventListener('error', (event) => {
  state.lastError = event.error?.stack || event.message || 'unknown error';
  record('WINDOW_ERROR', state.lastError);
});

window.addEventListener('unhandledrejection', (event) => {
  state.lastRejection = event.reason instanceof Error ? event.reason.stack || event.reason.message : String(event.reason);
  record('UNHANDLED_REJECTION', state.lastRejection);
});

window.addEventListener('online', () => record('NETWORK_ONLINE'));
window.addEventListener('offline', () => record('NETWORK_OFFLINE'));

window.addEventListener('pointerdown', (event) => {
  const target = document.elementFromPoint(event.clientX, event.clientY);
  state.lastPointerTarget = describeElement(target);
  state.lastPointerAt = performance.now();
  record('POINTERDOWN', {
    x: event.clientX,
    y: event.clientY,
    target: state.lastPointerTarget,
    targetPointerEvents: target ? getComputedStyle(target).pointerEvents : 'n/a',
    targetZIndex: target ? getComputedStyle(target).zIndex : 'n/a',
  });
}, true);

window.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  record('CLICK_CAPTURE', describeElement(target));
}, true);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    record('SW_CONTROLLER_CHANGE', Boolean(navigator.serviceWorker.controller));
  });
  navigator.serviceWorker.ready.then(() => {
    record('SW_READY', {
      controller: Boolean(navigator.serviceWorker.controller),
      scope: navigator.serviceWorker.controller?.scriptURL || 'none',
    });
  }).catch((error) => {
    record('SW_READY_REJECTED', error instanceof Error ? error.message : String(error));
  });
}

const heartbeatStart = performance.now();
let previousTick = heartbeatStart;
window.setInterval(() => {
  const now = performance.now();
  const gap = now - previousTick;
  state.lastHeartbeat = now;
  state.heartbeatCount += 1;
  previousTick = now;

  if (gap > 1000) {
    record('HEARTBEAT_DELAY', { gapMs: Math.round(gap), heartbeatCount: state.heartbeatCount });
  }
}, 250);

if ('PerformanceObserver' in window) {
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        state.longTaskCount += 1;
        state.lastLongTask = `${Math.round(entry.startTime)}ms + ${Math.round(entry.duration)}ms`;
        record('LONG_TASK', state.lastLongTask);
      }
    });
    observer.observe({ entryTypes: ['longtask'] });
  } catch {
    record('LONGTASK_OBSERVER_UNAVAILABLE');
  }
}

(window as Window & { __VOICECRAFT_OFFLINE_DIAG__?: DiagnosticState }).__VOICECRAFT_OFFLINE_DIAG__ = state;
record('DIAGNOSTIC_READY');

export function markVoiceCraftDiagnostic(label: string, value?: unknown) {
  record(label, value);
}
